-- Appels masqués livreur ↔ client : Amachia appelle le livreur puis le relie au client (Twilio).
-- Ni le livreur ni le client ne voient le numéro de l'autre. Additif et rejouable.

-- Réglages (identifiants du fournisseur) : table privée, lisible uniquement par le service.
create table if not exists public.telephony_settings (
  id int primary key check (id = 1),
  provider text not null default 'twilio',
  account_sid text,
  auth_token text,
  from_number text,
  enabled boolean not null default false,
  max_minutes int not null default 5 check (max_minutes between 1 and 30),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.telephony_settings enable row level security;
revoke all on public.telephony_settings from anon, authenticated;
insert into public.telephony_settings (id) values (1) on conflict do nothing;

create table if not exists public.masked_calls (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  courier_id uuid references public.couriers(id) on delete set null,
  provider_sid text,
  status text not null default 'requested',
  error text,
  duration_s int,
  created_at timestamptz not null default now()
);
create index if not exists masked_calls_recent on public.masked_calls (created_at desc);
alter table public.masked_calls enable row level security;
revoke all on public.masked_calls from anon, authenticated;

create or replace function public.masked_calls_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled and account_sid is not null and auth_token is not null and from_number is not null from telephony_settings where id = 1), false);
$$;

-- Le livreur ne reçoit plus le numéro du client dès que les appels masqués sont actifs.
create or replace function public.courier_order_json(o public.orders, d public.deliveries, _full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', case when _full then o.full_name end,
    'customer_phone', case when _full and d.status in ('assigned', 'picked_up', 'in_transit') and not masked_calls_enabled() then o.contact_phone end,
    'masked_call', _full and d.status in ('assigned', 'picked_up', 'in_transit') and masked_calls_enabled() and coalesce(o.contact_phone, '') <> '',
    'city', o.city, 'district', o.district,
    'address_details', case when _full then o.address_details end,
    'shipping_mode', o.shipping_mode, 'agency_name', o.shipping_agency_name,
    'agency_depot', (select concat_ws(', ', a.depot_district, a.depot_city) from shipping_agencies a where a.id = o.shipping_agency_id),
    'agency_address', (select a.address from shipping_agencies a where a.id = o.shipping_agency_id),
    'agency_phone', case when _full then (select a.phone from shipping_agencies a where a.id = o.shipping_agency_id) end,
    'payment_method', o.payment_method,
    'total', o.total_fcfa,
    'to_collect', case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.product_title, 'qty', i.quantity, 'price', i.unit_price_fcfa, 'color', i.color, 'size', i.size,
        'seller', (select s.name from sellers s where s.id = i.seller_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$$;
revoke all on function public.courier_order_json(public.orders, public.deliveries, boolean) from public, anon, authenticated;

-- Utilisée uniquement par la fonction serveur « courier-call » (clé de service).
create or replace function public.masked_call_prepare(_user uuid, _order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers; d deliveries; o orders; s telephony_settings; cid uuid;
begin
  select * into c from couriers where user_id = _user and status = 'active';
  if c.id is null then return jsonb_build_object('error', 'Compte livreur non activé.'); end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null or d.status not in ('assigned', 'picked_up', 'in_transit') then return jsonb_build_object('error', 'Appel possible uniquement pendant une livraison en cours.'); end if;
  select * into o from orders where id = _order;
  if coalesce(o.contact_phone, '') = '' then return jsonb_build_object('error', 'Le client n''a pas laissé de numéro.'); end if;
  select * into s from telephony_settings where id = 1;
  if not masked_calls_enabled() then return jsonb_build_object('error', 'Les appels masqués ne sont pas encore activés par Amachia.'); end if;
  if (select count(*) from masked_calls m where m.courier_id = c.id and m.created_at > now() - interval '10 minutes') >= 6 then
    return jsonb_build_object('error', 'Trop d''appels en peu de temps : réessayez dans quelques minutes.');
  end if;
  insert into masked_calls (order_id, courier_id) values (_order, c.id) returning id into cid;
  return jsonb_build_object('call_id', cid, 'courier_phone', '+237' || right(regexp_replace(c.phone, '\D', '', 'g'), 9),
    'customer_phone', '+237' || right(regexp_replace(o.contact_phone, '\D', '', 'g'), 9), 'order_number', o.order_number,
    'account_sid', s.account_sid, 'auth_token', s.auth_token, 'from_number', s.from_number, 'max_minutes', s.max_minutes);
end $$;
create or replace function public.masked_call_result(_call uuid, _sid text, _status text, _error text) returns void
language sql security definer set search_path = public as $$
  update masked_calls set provider_sid = _sid, status = _status, error = left(_error, 500) where id = _call;
$$;
revoke all on function public.masked_call_prepare(uuid, uuid), public.masked_call_result(uuid, text, text, text) from public, anon, authenticated;

-- Admin : réglages (lecture : section Livreurs ; modification : super administrateurs uniquement) + journal
insert into public.admin_fn_sections (fn, sections) values ('admin_telephony', array['livreurs'])
on conflict (fn) do update set sections = excluded.sections;
create or replace function public.admin_telephony() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s telephony_settings;
begin
  perform admin_guard('admin_telephony');
  select * into s from telephony_settings where id = 1;
  return jsonb_build_object('provider', s.provider, 'enabled', s.enabled, 'ready', masked_calls_enabled(), 'max_minutes', s.max_minutes,
    'account_sid_hint', case when s.account_sid is null then null else left(s.account_sid, 4) || '…' || right(s.account_sid, 4) end,
    'has_token', s.auth_token is not null, 'from_number', s.from_number, 'updated_at', s.updated_at,
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'created_at', m.created_at, 'status', m.status, 'error', m.error,
        'order_number', (select order_number from orders where id = m.order_id), 'courier', (select full_name from couriers where id = m.courier_id)) order by m.created_at desc)
      from (select * from masked_calls order by created_at desc limit 50) m), '[]'::jsonb),
    'calls_30d', (select count(*) from masked_calls where created_at > now() - interval '30 days' and status in ('queued', 'ringing', 'in-progress', 'completed', 'initiated')));
end $$;

-- Pas d'entrée dans admin_fn_sections : réservé aux super administrateurs.
create or replace function public.admin_save_telephony(_s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare num text := nullif(regexp_replace(coalesce(_s->>'from_number', ''), '[^\d+]', '', 'g'), '');
begin
  perform admin_guard('admin_save_telephony');
  if num is not null and num !~ '^\+\d{8,15}$' then raise exception 'Numéro d''appel au format international (ex. +1 415 555 0100).'; end if;
  if nullif(btrim(coalesce(_s->>'account_sid', '')), '') is not null and btrim(_s->>'account_sid') !~ '^AC[0-9a-fA-F]{32}$' then raise exception 'Identifiant de compte Twilio invalide (commence par AC, 34 caractères).'; end if;
  update telephony_settings set
    account_sid = coalesce(nullif(btrim(coalesce(_s->>'account_sid', '')), ''), account_sid),
    auth_token = coalesce(nullif(btrim(coalesce(_s->>'auth_token', '')), ''), auth_token),
    from_number = coalesce(num, from_number),
    enabled = coalesce((_s->>'enabled')::boolean, enabled),
    max_minutes = coalesce(nullif(_s->>'max_minutes', '')::int, max_minutes),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
end $$;
revoke all on function public.admin_telephony(), public.admin_save_telephony(jsonb) from public, anon;
grant execute on function public.admin_telephony(), public.admin_save_telephony(jsonb) to authenticated;
