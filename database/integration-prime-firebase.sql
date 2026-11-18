-- Prime : alertes de commandes par Google Firebase (FCM), sans notification permanente sur le téléphone.
-- 1) chaque téléphone enregistre son jeton Firebase ; 2) à chaque commande (et à chaque vague de proximité),
-- la fonction « courier-push » envoie l'alerte aux seuls livreurs à qui la commande est proposée.

create table if not exists public.courier_push_tokens (
  token text primary key,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.courier_push_tokens enable row level security;
revoke all on public.courier_push_tokens from anon, authenticated;

create table if not exists public.courier_push_log (
  order_id uuid not null,
  courier_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (order_id, courier_id)
);
alter table public.courier_push_log enable row level security;
revoke all on public.courier_push_log from anon, authenticated;

create or replace function public.courier_push_register(_token text) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  if length(coalesce(_token, '')) < 20 then return; end if;
  insert into courier_push_tokens (token, courier_id) values (_token, c.id)
  on conflict (token) do update set courier_id = excluded.courier_id, updated_at = now();
  delete from courier_push_tokens where courier_id = c.id and token not in (select token from courier_push_tokens where courier_id = c.id order by updated_at desc limit 3);
end $$;
create or replace function public.courier_push_forget(_token text) returns void
language sql security definer set search_path = public as $$ delete from courier_push_tokens where token = _token; $$;
revoke all on function public.courier_push_register(text), public.courier_push_forget(text) from public, anon;
grant execute on function public.courier_push_register(text), public.courier_push_forget(text) to authenticated;

-- livreurs à prévenir maintenant pour cette commande (et pas encore prévenus) : réservé à la fonction d'envoi
create or replace function public.courier_push_targets(_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; res jsonb := '[]'::jsonb; c couriers; e jsonb; p jsonb; body text; toks jsonb;
begin
  select * into o from orders where id = _order;
  if o.id is null or o.status in ('Annulée', 'Livrée') or coalesce(o.total_fcfa, 0) <= 0 then return res; end if;
  if exists (select 1 from deliveries d where d.order_id = o.id and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered')) then return res; end if;
  p := order_pickup(o.id);
  body := concat_ws(' · ', p->>'name', nullif(concat_ws(', ', case when o.shipping_mode = 'agency' then 'Agence ' || o.shipping_agency_name else o.district end, o.city), ''),
    case when o.payment_method ilike '%livraison%' then replace(to_char(o.total_fcfa, 'FM999G999G999'), ',', ' ') || ' FCFA à encaisser' else 'déjà payé' end);
  for c in select * from couriers where status = 'active' and availability <> 'offline' loop
    if exists (select 1 from courier_push_log l where l.order_id = o.id and l.courier_id = c.id) then continue; end if;
    e := dispatch_eligible(o, c);
    if e is null then continue; end if;
    select coalesce(jsonb_agg(t.token), '[]'::jsonb) into toks from courier_push_tokens t where t.courier_id = c.id;
    insert into courier_push_log (order_id, courier_id) values (o.id, c.id) on conflict do nothing;
    if jsonb_array_length(toks) = 0 then continue; end if;
    res := res || jsonb_build_object('courier_id', c.id, 'tokens', toks, 'title', '📦 Nouvelle course près de vous',
      'body', body || coalesce(' · à ' || case when (e->>'km')::float < 1 then round((e->>'km')::numeric * 1000) || ' m' else replace(round((e->>'km')::numeric, 1)::text, '.', ',') || ' km' end, ''),
      'order_number', o.order_number);
  end loop;
  return res;
end $$;
-- jetons des livreurs déjà prévenus (commande prise par un autre ou annulée : on retire leur notification)
create or replace function public.courier_push_notified(_order uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.token), '[]'::jsonb) from courier_push_log l join courier_push_tokens t on t.courier_id = l.courier_id where l.order_id = _order;
$$;
create or replace function public.courier_push_mine(_user uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.token), '[]'::jsonb) from couriers c join courier_push_tokens t on t.courier_id = c.id where c.user_id = _user and c.status = 'active';
$$;
create or replace function public.courier_push_drop(_token text) returns void
language sql security definer set search_path = public as $$ delete from courier_push_tokens where token = _token; $$;
create or replace function public.courier_push_open(_order uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from orders o where o.id = _order and o.status not in ('Annulée', 'Livrée'))
     and not exists (select 1 from deliveries d where d.order_id = _order and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered'));
$$;
revoke all on function public.courier_push_targets(uuid), public.courier_push_notified(uuid), public.courier_push_mine(uuid), public.courier_push_drop(text), public.courier_push_open(uuid) from public, anon, authenticated;

-- chaque événement livreur (nouvelle commande, refus → livreur suivant, prise, annulation) déclenche l'envoi
create or replace function public.courier_feed_push() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('new_order', 'taken', 'cancelled') and new.order_id is not null then
    perform net.http_post(
      url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/courier-push',
      body := jsonb_build_object('order_id', new.order_id, 'kind', new.kind),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists courier_feed_push on public.courier_feed;
create trigger courier_feed_push after insert on public.courier_feed for each row execute function public.courier_feed_push();
