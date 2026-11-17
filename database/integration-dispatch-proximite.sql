-- Distribution des commandes au livreur le plus proche de la boutique (façon Yango / Uber).
-- Vague 1 (0–45 s) : seul le livreur disponible le plus proche (≤ 6 km) la reçoit ; s'il refuse, le suivant.
-- Vague 2 (45–120 s) : tous les livreurs à moins de 6 km. Vague 3 (> 120 s) : toute la ville.
-- Additif et rejouable.

-- 1) Position de la boutique (point de retrait)
alter table public.sellers
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists pickup_address text,
  add column if not exists pickup_updated_at timestamptz;

-- Reprise des positions partagées à l'inscription (« lat,lng » dans l'adresse de la boutique)
update public.sellers s set pickup_lat = split_part(sp.shop_address, ',', 1)::double precision,
  pickup_lng = split_part(sp.shop_address, ',', 2)::double precision, pickup_updated_at = now()
from public.seller_profiles sp
where sp.id = s.owner_id and s.pickup_lat is null and sp.shop_address ~ '^\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*$';

create or replace function public.seller_set_pickup(_lat double precision, _lng double precision, _address text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connectez-vous.'; end if;
  if _lat is null or _lng is null or _lat not between 1.5 and 13.2 or _lng not between 8.4 and 16.3 then raise exception 'Position hors du Cameroun.'; end if;
  update sellers set pickup_lat = _lat, pickup_lng = _lng, pickup_address = nullif(left(btrim(coalesce(_address, '')), 200), ''), pickup_updated_at = now()
  where owner_id = auth.uid();
  if not found then raise exception 'Boutique introuvable.'; end if;
end $$;
create or replace function public.seller_pickup() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lat', pickup_lat, 'lng', pickup_lng, 'address', pickup_address, 'updated_at', pickup_updated_at, 'city', city)
  from sellers where owner_id = auth.uid() order by created_at limit 1;
$$;
revoke all on function public.seller_set_pickup(double precision, double precision, text), public.seller_pickup() from public, anon;
grant execute on function public.seller_set_pickup(double precision, double precision, text), public.seller_pickup() to authenticated;

-- 2) Position des livreurs en ligne (envoyée par l'application toutes les ~20 s)
alter table public.couriers
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision,
  add column if not exists last_loc_at timestamptz;

create or replace function public.courier_ping(_lat double precision, _lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _lat is null or _lng is null then return; end if;
  update couriers set last_lat = _lat, last_lng = _lng, last_loc_at = now(), last_seen_at = now() where user_id = auth.uid() and status = 'active';
end $$;
revoke all on function public.courier_ping(double precision, double precision) from public, anon;
grant execute on function public.courier_ping(double precision, double precision) to authenticated;

create table if not exists public.courier_declines (
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_id, courier_id)
);
alter table public.courier_declines enable row level security;
revoke all on public.courier_declines from anon, authenticated;

-- 3) Outils de distance et point de retrait d'une commande
create or replace function public.geo_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) returns double precision
language sql immutable as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Boutique où récupérer le colis : la première boutique de la commande qui a une position (sinon la première tout court).
create or replace function public.order_pickup(_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('seller_id', s.id, 'name', s.name, 'lat', s.pickup_lat, 'lng', s.pickup_lng,
    'address', coalesce(s.pickup_address, nullif(sp.shop_address, '') , s.city), 'city', coalesce(sp.city, s.city),
    'sellers', (select count(distinct i2.seller_id) from order_items i2 where i2.order_id = _order and i2.seller_status <> 'cancelled'))
  from order_items i join sellers s on s.id = i.seller_id left join seller_profiles sp on sp.id = s.owner_id
  where i.order_id = _order and i.seller_status <> 'cancelled'
  order by (s.pickup_lat is null), i.created_at limit 1;
$$;

-- Le livreur peut-il voir / accepter cette commande maintenant ? Renvoie la distance (km) jusqu'à la boutique, ou null s'il ne peut pas.
create or replace function public.dispatch_eligible(o public.orders, c public.couriers) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p jsonb := order_pickup(o.id); age double precision; d double precision; fresh boolean; nearest uuid;
  plat double precision; plng double precision;
begin
  if c.id is null or c.status <> 'active' or c.availability = 'offline' then return null; end if;
  if c.city is not null and lower(order_courier_city(o)) <> lower(c.city) then return null; end if;
  if exists (select 1 from courier_declines x where x.order_id = o.id and x.courier_id = c.id) then return null; end if;
  -- dépôt en agence : pas de boutique précise, toute la ville
  plat := (p->>'lat')::double precision; plng := (p->>'lng')::double precision;
  age := extract(epoch from now() - coalesce((select min(f.created_at) from courier_feed f where f.order_id = o.id and f.kind = 'new_order'), o.created_at));
  fresh := c.last_loc_at is not null and c.last_loc_at > now() - interval '10 minutes';
  d := case when fresh and plat is not null then geo_km(c.last_lat, c.last_lng, plat, plng) end;
  if plat is null or age > 120 then return jsonb_build_object('km', d, 'wave', 3); end if;   -- boutique sans position ou vague 3 : toute la ville
  if d is null or d > 6 then return null; end if;                                              -- hors zone (ou position inconnue) pendant les vagues 1 et 2
  if age > 45 then return jsonb_build_object('km', d, 'wave', 2); end if;
  -- vague 1 : seulement le livreur disponible le plus proche (qui n'a pas refusé)
  select x.id into nearest from couriers x
  where x.status = 'active' and x.availability = 'available' and x.last_loc_at > now() - interval '10 minutes'
    and (x.city is null or lower(x.city) = lower(order_courier_city(o)))
    and not exists (select 1 from courier_declines y where y.order_id = o.id and y.courier_id = x.id)
    and not exists (select 1 from deliveries z where z.courier_id = x.id and z.status in ('assigned', 'picked_up', 'in_transit'))
  order by geo_km(x.last_lat, x.last_lng, plat, plng) limit 1;
  if nearest = c.id then return jsonb_build_object('km', d, 'wave', 1, 'exclusive_until', now() + make_interval(secs => greatest(0, 45 - age))); end if;
  return null;
end $$;
revoke all on function public.dispatch_eligible(public.orders, public.couriers), public.order_pickup(uuid) from public, anon, authenticated;

-- 4) Demandes visibles par le livreur (proximité) + refus + acceptation contrôlée
create or replace function public.courier_requests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  return coalesce((select jsonb_agg(x.j order by (x.j->>'pickup_km')::double precision nulls last, x.j->>'created_at' desc) from (
    select jsonb_build_object(
      'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
      'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
      'city', o.city, 'district', case when o.shipping_mode = 'agency' then null else o.district end,
      'shipping_mode', o.shipping_mode, 'agency_name', o.shipping_agency_name,
      'agency_depot', (select concat_ws(', ', a.depot_district, a.depot_city) from shipping_agencies a where a.id = o.shipping_agency_id),
      'payment_method', o.payment_method, 'total', o.total_fcfa,
      'to_collect', case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end,
      'items_count', (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
      'courier_pay', c.pay_per_delivery,
      'pickup', order_pickup(o.id) - 'seller_id',
      'pickup_km', e->'km', 'wave', e->'wave', 'exclusive_until', e->'exclusive_until') j
    from orders o cross join lateral (select dispatch_eligible(o, c) e) el
    where o.status not in ('Annulée', 'Livrée') and o.created_at > now() - interval '3 days' and coalesce(o.total_fcfa, 0) > 0
      and not exists (select 1 from deliveries d where d.order_id = o.id and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered'))
      and el.e is not null
  ) x), '[]'::jsonb);
end $$;

create or replace function public.courier_decline(_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  insert into courier_declines (order_id, courier_id) values (_order, c.id) on conflict do nothing;
  -- les autres livreurs proches sont prévenus tout de suite (la commande passe au suivant)
  insert into courier_feed (kind, order_id, city) select 'new_order', o.id, order_courier_city(o) from orders o where o.id = _order;
end $$;
revoke all on function public.courier_decline(uuid) from public, anon;
grant execute on function public.courier_decline(uuid) to authenticated;

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
  if dispatch_eligible(o, c) is null then raise exception 'Cette commande est proposée en priorité à un livreur plus proche de la boutique.'; end if;
  insert into deliveries (order_id, courier_id, carrier_id, courier_pay, status)
  values (_order, c.id, c.carrier_id, c.pay_per_delivery, 'assigned')
  on conflict (order_id) do update set courier_id = excluded.courier_id, carrier_id = excluded.carrier_id, courier_pay = excluded.courier_pay,
    status = 'assigned', assigned_at = now(), picked_at = null, failed_at = null, updated_at = now()
  returning * into d;
  update couriers set availability = 'busy' where id = c.id and availability = 'available';
  perform add_order_event(_order, 'courier_assigned', 'Livreur affecté : ' || split_part(c.full_name, ' ', 1));
  return courier_order_json(o, d, true);
end $$;

-- 5) Fiche de course : boutique de retrait + photos des articles
create or replace function public.courier_order_json(o public.orders, d public.deliveries, _full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', case when _full then o.full_name end,
    'customer_phone', null,
    'has_customer_phone', coalesce(o.contact_phone, '') <> '',
    'masked_call', _full and d.status in ('assigned', 'picked_up', 'in_transit') and masked_calls_enabled() and coalesce(o.contact_phone, '') <> '',
    'contact_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'reason', q.reason, 'status', q.status, 'admin_note', q.admin_note, 'created_at', q.created_at, 'handled_at', q.handled_at) order by q.created_at desc), '[]'::jsonb)
      from courier_contact_requests q where q.order_id = o.id and q.courier_id = d.courier_id and q.created_at > now() - interval '3 days'),
    'pickup', order_pickup(o.id) - 'seller_id',
    'pickups', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', s.name, 'lat', s.pickup_lat, 'lng', s.pickup_lng, 'address', coalesce(s.pickup_address, s.city))), '[]'::jsonb)
      from order_items i join sellers s on s.id = i.seller_id where i.order_id = o.id and i.seller_status <> 'cancelled'),
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
        'seller', (select s.name from sellers s where s.id = i.seller_id),
        'images', (select coalesce(jsonb_agg(v) filter (where v ~ '^https?://'), '[]'::jsonb) from products p, jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) v where p.id = i.product_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$$;
revoke all on function public.courier_order_json(public.orders, public.deliveries, boolean) from public, anon, authenticated;
