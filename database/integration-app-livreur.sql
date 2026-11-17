-- Application livreur (APK) : comptes livreurs, demandes de livraison en direct, acceptation,
-- suivi des statuts et encaissements. Additif et rejouable.

-- 1) Lien livreur ↔ compte de connexion, activation par code donné par l'admin
alter table public.couriers
  add column if not exists user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists activation_hash text,
  add column if not exists activation_expires timestamptz,
  add column if not exists activation_attempts int not null default 0,
  add column if not exists last_seen_at timestamptz;

create or replace function public.current_courier() returns public.couriers
language sql stable security definer set search_path = public as $$
  select * from couriers where user_id = auth.uid() and status = 'active' limit 1;
$$;

insert into public.admin_fn_sections (fn, sections) values ('admin_courier_activation', array['livreurs'])
on conflict (fn) do update set sections = excluded.sections;

-- L'admin génère un code à 6 chiffres (valable 72 h) à transmettre au livreur ; il sert aussi à
-- réinitialiser le mot de passe d'un livreur qui l'a oublié.
create or replace function public.admin_courier_activation(_courier uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c couriers; code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  perform admin_guard('admin_courier_activation');
  select * into c from couriers where id = _courier;
  if c.id is null then raise exception 'Livreur introuvable.'; end if;
  if right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) !~ '^6\d{8}$' then raise exception 'Ajoutez d''abord un numéro de téléphone valide (9 chiffres, commence par 6) à ce livreur.'; end if;
  update couriers set activation_hash = encode(digest(code || ':' || id::text, 'sha256'), 'hex'), activation_expires = now() + interval '72 hours', activation_attempts = 0 where id = c.id;
  return jsonb_build_object('code', code, 'phone', c.phone, 'expires_at', now() + interval '72 hours', 'activated', c.user_id is not null);
end $$;
revoke all on function public.admin_courier_activation(uuid) from public, anon;
grant execute on function public.admin_courier_activation(uuid) to authenticated;

-- Utilisée uniquement par la fonction serveur « courier-activate » (clé de service).
create or replace function public.courier_check_activation(_phone text, _code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c couriers; d text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 9);
begin
  select * into c from couriers where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = d and status = 'active' order by created_at limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Aucun livreur Amashia n''est enregistré avec ce numéro.'); end if;
  if c.activation_hash is null or c.activation_expires < now() then return jsonb_build_object('ok', false, 'error', 'Code expiré ou inexistant : demandez un nouveau code à Amashia.'); end if;
  if c.activation_attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Trop d''essais : demandez un nouveau code à Amashia.'); end if;
  if encode(digest(coalesce(_code, '') || ':' || c.id::text, 'sha256'), 'hex') <> c.activation_hash then
    update couriers set activation_attempts = activation_attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'error', 'Code incorrect.');
  end if;
  return jsonb_build_object('ok', true, 'courier_id', c.id, 'user_id', c.user_id, 'digits', d, 'full_name', c.full_name);
end $$;
create or replace function public.courier_link_account(_courier uuid, _user uuid) returns void
language sql security definer set search_path = public as $$
  update couriers set user_id = _user, activation_hash = null, activation_expires = null, activation_attempts = 0 where id = _courier;
$$;
revoke all on function public.courier_check_activation(text, text), public.courier_link_account(uuid, uuid) from public, anon, authenticated;

-- 2) Fil des nouvelles commandes / affectations (lu en direct par l'application, sans données personnelles)
create table if not exists public.courier_feed (
  id bigserial primary key,
  kind text not null check (kind in ('new_order', 'assigned', 'taken', 'cancelled')),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete cascade,
  city text,
  created_at timestamptz not null default now()
);
create index if not exists courier_feed_recent on public.courier_feed (created_at desc);
alter table public.courier_feed enable row level security;
drop policy if exists "livreur lit son fil" on public.courier_feed;
create policy "livreur lit son fil" on public.courier_feed for select to authenticated using (
  exists (select 1 from couriers c where c.user_id = auth.uid() and c.status = 'active'
    and (courier_feed.courier_id = c.id or (courier_feed.courier_id is null and (c.city is null or lower(c.city) = lower(coalesce(courier_feed.city, c.city)))))));
grant select on public.courier_feed to authenticated;
do $$ begin alter publication supabase_realtime add table public.courier_feed; exception when duplicate_object then null; end $$;

-- Ville où le livreur prend le colis en charge : celle du client (Yaoundé / Douala) ou celle de l'agence d'expédition.
create or replace function public.order_courier_city(o public.orders) returns text
language sql stable security definer set search_path = public as $$
  select case when o.shipping_mode = 'agency' then coalesce((select a.depot_city from shipping_agencies a where a.id = o.shipping_agency_id), 'Yaoundé') else o.city end;
$$;

create or replace function public.orders_courier_feed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into courier_feed (kind, order_id, city) values ('new_order', new.id, order_courier_city(new));
  elsif new.status = 'Annulée' and old.status is distinct from 'Annulée' then
    insert into courier_feed (kind, order_id, city, courier_id) values ('cancelled', new.id, order_courier_city(new), (select d.courier_id from deliveries d where d.order_id = new.id));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists orders_courier_feed on public.orders;
create trigger orders_courier_feed after insert or update of status on public.orders for each row execute function public.orders_courier_feed();

create or replace function public.deliveries_courier_feed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'assigned' and (tg_op = 'INSERT' or old.courier_id is distinct from new.courier_id or old.status is distinct from 'assigned') then
    insert into courier_feed (kind, order_id, courier_id, city) select 'assigned', new.order_id, new.courier_id, order_courier_city(o) from orders o where o.id = new.order_id;
    insert into courier_feed (kind, order_id, city) select 'taken', new.order_id, order_courier_city(o) from orders o where o.id = new.order_id;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists deliveries_courier_feed on public.deliveries;
create trigger deliveries_courier_feed after insert or update on public.deliveries for each row execute function public.deliveries_courier_feed();

-- 3) Données de l'application (uniquement pour le livreur connecté)
create or replace function public.courier_order_json(o public.orders, d public.deliveries, _full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', case when _full then o.full_name end,
    'customer_phone', case when _full and d.status in ('assigned', 'picked_up', 'in_transit') then o.contact_phone end,
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

create or replace function public.courier_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then return null; end if;
  update couriers set last_seen_at = now() where id = c.id;
  return to_jsonb(c) - 'activation_hash' - 'activation_attempts' - 'activation_expires' - 'id_number' || jsonb_build_object(
    'carrier', (select name from carriers where id = c.carrier_id),
    'today_total', (select count(*) from deliveries d where d.courier_id = c.id and (d.assigned_at::date = current_date or d.status in ('assigned', 'picked_up', 'in_transit'))),
    'today_done', (select count(*) from deliveries d where d.courier_id = c.id and d.status = 'delivered' and d.delivered_at::date = current_date),
    'active', (select count(*) from deliveries d where d.courier_id = c.id and d.status in ('assigned', 'picked_up', 'in_transit')),
    'today_earnings', (select coalesce(sum(d.courier_pay), 0) from deliveries d where d.courier_id = c.id and d.status = 'delivered' and d.delivered_at::date = current_date),
    'total_done', (select count(*) from deliveries d where d.courier_id = c.id and d.status = 'delivered'),
    'total_failed', (select count(*) from deliveries d where d.courier_id = c.id and d.status = 'failed'),
    'earned_total', (select coalesce(sum(d.courier_pay), 0) from deliveries d where d.courier_id = c.id and d.status = 'delivered'),
    'paid_total', (select coalesce(sum(p.amount), 0) from courier_payouts p where p.courier_id = c.id),
    'cash_in_hand', (select coalesce(sum(d.cash_collected), 0) from deliveries d where d.courier_id = c.id and d.status = 'delivered'));
end $$;

create or replace function public.courier_deliveries(_scope text default 'all') returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  return coalesce((select jsonb_agg(courier_order_json(o, d, d.status in ('assigned', 'picked_up', 'in_transit')) order by
      case d.status when 'in_transit' then 0 when 'picked_up' then 1 when 'assigned' then 2 else 3 end, coalesce(d.delivered_at, d.failed_at, d.assigned_at) desc)
    from deliveries d join orders o on o.id = d.order_id
    where d.courier_id = c.id and (_scope = 'all' or (_scope = 'active' and d.status in ('assigned', 'picked_up', 'in_transit')) or (_scope = 'history' and d.status in ('delivered', 'failed')))
      and (d.status in ('assigned', 'picked_up', 'in_transit') or coalesce(d.delivered_at, d.failed_at, d.assigned_at) > now() - interval '90 days')), '[]'::jsonb);
end $$;

create or replace function public.courier_delivery(_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); o orders; d deliveries;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  select * into o from orders where id = _order;
  return courier_order_json(o, d, d.status in ('assigned', 'picked_up', 'in_transit'));
end $$;

-- Commandes à prendre en charge dans la ville du livreur (pas encore attribuées)
create or replace function public.courier_requests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
      'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
      'city', o.city, 'district', case when o.shipping_mode = 'agency' then null else o.district end,
      'shipping_mode', o.shipping_mode, 'agency_name', o.shipping_agency_name,
      'agency_depot', (select concat_ws(', ', a.depot_district, a.depot_city) from shipping_agencies a where a.id = o.shipping_agency_id),
      'payment_method', o.payment_method, 'total', o.total_fcfa,
      'to_collect', case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end,
      'items_count', (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
      'courier_pay', c.pay_per_delivery) order by o.created_at desc)
    from orders o
    where o.status not in ('Annulée', 'Livrée') and o.created_at > now() - interval '3 days'
      and (c.city is null or lower(order_courier_city(o)) = lower(c.city))
      and (coalesce(cardinality(c.districts), 0) = 0 or o.shipping_mode = 'agency' or lower(coalesce(o.district, '')) = any(select lower(x) from unnest(c.districts) x))
      and not exists (select 1 from deliveries d where d.order_id = o.id and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered'))), '[]'::jsonb);
end $$;

create or replace function public.courier_accept(_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); o orders; d deliveries;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into o from orders where id = _order for update;
  if o.id is null or o.status in ('Annulée', 'Livrée') then raise exception 'Cette commande n''est plus disponible.'; end if;
  select * into d from deliveries where order_id = _order for update;
  if d.id is not null and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered') then
    if d.courier_id = c.id then return courier_order_json(o, d, true); end if;
    raise exception 'Trop tard : un autre livreur a déjà pris cette commande.';
  end if;
  insert into deliveries (order_id, courier_id, carrier_id, courier_pay, status)
  values (_order, c.id, c.carrier_id, c.pay_per_delivery, 'assigned')
  on conflict (order_id) do update set courier_id = excluded.courier_id, carrier_id = excluded.carrier_id, courier_pay = excluded.courier_pay,
    status = 'assigned', assigned_at = now(), picked_at = null, failed_at = null, updated_at = now()
  returning * into d;
  update couriers set availability = 'busy' where id = c.id and availability = 'available';
  perform add_order_event(_order, 'courier_assigned', 'Livreur affecté : ' || split_part(c.full_name, ' ', 1));
  return courier_order_json(o, d, true);
end $$;

-- Statut d'une commande changé par le livreur (même effet que dans l'admin, sans annulation possible)
create or replace function public.courier_set_order_status(_order uuid, _status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _status in ('shipped', 'delivered') then
    perform add_order_event(_order, 'preparing', 'En préparation chez le vendeur');
    perform add_order_event(_order, 'shipped', 'Colis remis au livreur');
  end if;
  if _status = 'delivered' then perform add_order_event(_order, 'delivered', 'Commande livrée'); end if;
  update order_items set seller_status = _status where order_id = _order and seller_status <> 'cancelled';
  update orders set status = case _status when 'delivered' then 'Livrée' else 'Expédiée' end,
    delivered_at = case when _status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    admin_status = _status, admin_status_at = now(), updated_at = now()
  where id = _order and status <> 'Annulée';
end $$;
revoke all on function public.courier_set_order_status(uuid, text) from public, anon, authenticated;

create or replace function public.courier_update_delivery(_order uuid, _status text, _note text default null, _cash int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); d deliveries; o orders;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id for update;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status in ('delivered') then raise exception 'Cette livraison est déjà terminée.'; end if;
  if _status not in ('picked_up', 'in_transit', 'delivered', 'failed') then raise exception 'Statut inconnu.'; end if;
  if _status = 'failed' and length(btrim(coalesce(_note, ''))) < 5 then raise exception 'Indiquez la raison de l''échec (client absent, adresse introuvable…).'; end if;
  select * into o from orders where id = _order;
  if o.status = 'Annulée' then raise exception 'Commande annulée par Amashia : ne la livrez pas.'; end if;
  update deliveries set status = _status, note = coalesce(nullif(btrim(_note), ''), note), updated_at = now(),
    picked_at = case when _status in ('picked_up', 'in_transit', 'delivered') then coalesce(picked_at, now()) else picked_at end,
    delivered_at = case when _status = 'delivered' then now() else delivered_at end,
    failed_at = case when _status = 'failed' then now() else null end,
    cash_collected = case when _status = 'delivered' then greatest(0, coalesce(_cash, case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end)) else cash_collected end
  where id = d.id returning * into d;
  if _status in ('picked_up', 'in_transit') then perform courier_set_order_status(_order, 'shipped'); end if;
  if _status = 'delivered' then
    perform courier_set_order_status(_order, 'delivered');
    update couriers set availability = 'available' where id = c.id and availability = 'busy'
      and not exists (select 1 from deliveries x where x.courier_id = c.id and x.status in ('assigned', 'picked_up', 'in_transit'));
  end if;
  if _status = 'failed' then perform add_order_event(_order, 'delivery_failed', 'Tentative de livraison échouée : ' || btrim(_note)); end if;
  return courier_order_json(o, d, _status <> 'delivered');
end $$;

create or replace function public.courier_set_availability(_availability text) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  if _availability not in ('available', 'offline', 'busy') then raise exception 'Disponibilité inconnue.'; end if;
  update couriers set availability = _availability, last_seen_at = now() where id = c.id;
end $$;

create or replace function public.courier_payments() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  return jsonb_build_object(
    'cash', (select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
        'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'), 'district', o.district,
        'amount', d.cash_collected, 'pay', d.courier_pay, 'date', d.delivered_at) order by d.delivered_at desc), '[]'::jsonb)
      from deliveries d join orders o on o.id = d.order_id where d.courier_id = c.id and d.status = 'delivered' and d.delivered_at > now() - interval '90 days'),
    'payouts', (select coalesce(jsonb_agg(to_jsonb(p) order by p.paid_at desc), '[]'::jsonb) from courier_payouts p where p.courier_id = c.id));
end $$;

revoke all on function public.courier_me(), public.courier_deliveries(text), public.courier_delivery(uuid), public.courier_requests(),
  public.courier_accept(uuid), public.courier_update_delivery(uuid, text, text, int), public.courier_set_availability(text), public.courier_payments(),
  public.current_courier(), public.courier_order_json(public.orders, public.deliveries, boolean), public.order_courier_city(public.orders) from public, anon;
grant execute on function public.courier_me(), public.courier_deliveries(text), public.courier_delivery(uuid), public.courier_requests(),
  public.courier_accept(uuid), public.courier_update_delivery(uuid, text, text, int), public.courier_set_availability(text), public.courier_payments() to authenticated;
revoke all on function public.courier_order_json(public.orders, public.deliveries, boolean) from authenticated;

-- 4) Résumé non personnel de la commande dans le fil (texte des notifications)
alter table public.courier_feed add column if not exists info jsonb;
create or replace function public.order_feed_info(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('order_number', o.order_number, 'district', case when o.shipping_mode = 'agency' then null else o.district end,
    'city', o.city, 'agency', o.shipping_agency_name, 'total', o.total_fcfa,
    'to_collect', case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end,
    'items', (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id));
$$;
create or replace function public.courier_feed_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.info is null then select order_feed_info(o) into new.info from orders o where o.id = new.order_id; end if;
  return new;
end $$;
drop trigger if exists courier_feed_fill on public.courier_feed;
create trigger courier_feed_fill before insert on public.courier_feed for each row execute function public.courier_feed_fill();

-- La commande est créée avant ses articles : la notification part quand son total est enregistré (commande complète).
create or replace function public.orders_courier_feed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and coalesce(new.total_fcfa, 0) > 0 and coalesce(old.total_fcfa, 0) = 0 and new.status not in ('Annulée', 'Livrée')
     and not exists (select 1 from courier_feed f where f.order_id = new.id and f.kind = 'new_order') then
    insert into courier_feed (kind, order_id, city) values ('new_order', new.id, order_courier_city(new));
  elsif tg_op = 'UPDATE' and new.status = 'Annulée' and old.status is distinct from 'Annulée' then
    insert into courier_feed (kind, order_id, city, courier_id) values ('cancelled', new.id, order_courier_city(new), (select d.courier_id from deliveries d where d.order_id = new.id));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists orders_courier_feed on public.orders;
create trigger orders_courier_feed after update of status, total_fcfa on public.orders for each row execute function public.orders_courier_feed();
