-- Amachia — Admin, étape 7 : logistique (transporteurs, livreurs, colis, incidents, paiements),
-- quartiers des zones, bannières d'accueil, messages aux clients, marketing créé par l'admin.

-- 1. Transporteurs (entreprises logistiques partenaires) ---------------------------------------
create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  contact_name text,
  phone text,
  email text,
  city text,
  address text,
  cities text[] not null default '{}',
  price_note text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists carriers_name_uq on public.carriers (lower(name));
alter table public.carriers enable row level security;

-- 2. Livreurs ------------------------------------------------------------------------------------
create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  photo_url text,
  id_number text,
  city text,
  districts text[] not null default '{}',
  vehicle_type text not null default 'moto' check (vehicle_type in ('moto', 'voiture', 'tricycle', 'velo', 'camionnette', 'pied')),
  vehicle_brand text,
  vehicle_plate text,
  vehicle_color text,
  insurance_until date,
  pay_per_delivery integer not null default 1000 check (pay_per_delivery >= 0),
  availability text not null default 'offline' check (availability in ('available', 'busy', 'offline')),
  work_days text[] not null default array['lun','mar','mer','jeu','ven','sam'],
  work_start time default '08:00',
  work_end time default '18:00',
  status text not null default 'active' check (status in ('active', 'suspended')),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.couriers enable row level security;

-- 3. Colis : affectation d'une commande à un livreur -------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  carrier_id uuid references public.carriers(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')),
  courier_pay integer not null default 0,
  cash_collected integer,
  note text,
  assigned_at timestamptz not null default now(),
  picked_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.deliveries enable row level security;

-- 4. Incidents de livraison ----------------------------------------------------------------------
create table if not exists public.courier_incidents (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid references public.couriers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null check (kind in ('retard', 'client_absent', 'adresse_introuvable', 'colis_endommage', 'colis_perdu', 'accident', 'plainte_client', 'paiement', 'autre')),
  severity text not null default 'moyenne' check (severity in ('faible', 'moyenne', 'grave')),
  description text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.courier_incidents enable row level security;

-- 5. Paiements des livreurs ----------------------------------------------------------------------
create table if not exists public.courier_payouts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  amount integer not null check (amount > 0),
  method text,
  reference text,
  note text,
  paid_at timestamptz not null default now()
);
alter table public.courier_payouts enable row level security;

-- 6. Quartiers des zones de livraison ------------------------------------------------------------
alter table public.delivery_zones add column if not exists districts text[] not null default '{}';
alter table public.delivery_zones add column if not exists carrier_id uuid references public.carriers(id) on delete set null;

-- 7. Bannières de la page d'accueil (6 au maximum) -----------------------------------------------
create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  mobile_image_url text,
  link_url text,
  title text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.home_banners enable row level security;
drop policy if exists "Lecture publique des bannières" on public.home_banners;
create policy "Lecture publique des bannières" on public.home_banners for select using (true);

create or replace function public.home_banners_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'image_url', image_url, 'mobile_image_url', mobile_image_url, 'link_url', link_url, 'title', title) order by sort_order, created_at), '[]'::jsonb)
  from (select * from public.home_banners where is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        order by sort_order, created_at limit 6) b
$$;
grant execute on function public.home_banners_live() to anon, authenticated;

create or replace function public.banner_click(_id uuid) returns void
language sql security definer set search_path = public as $$ update public.home_banners set clicks = clicks + 1 where id = _id $$;
grant execute on function public.banner_click(uuid) to anon, authenticated;

-- 8. Messages aux clients (affichés sur le site client) ------------------------------------------
create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  link_url text,
  link_label text,
  audience text not null default 'all' check (audience in ('all', 'prime', 'buyers', 'user')),
  user_id uuid references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_message_reads (
  message_id uuid references public.customer_messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.customer_messages enable row level security;
alter table public.customer_message_reads enable row level security;

create or replace function public.customer_inbox() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'body', m.body, 'image_url', m.image_url, 'link_url', m.link_url, 'link_label', m.link_label) order by m.created_at), '[]'::jsonb)
  from public.customer_messages m
  where m.is_active and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
    and not exists (select 1 from public.customer_message_reads r where r.message_id = m.id and r.user_id = auth.uid())
    and (m.audience = 'all'
      or (m.audience = 'prime' and public.prime_active(auth.uid()))
      or (m.audience = 'buyers' and exists (select 1 from public.orders o where o.user_id = auth.uid() and o.status <> 'Annulée'))
      or (m.audience = 'user' and m.user_id = auth.uid()))
$$;
create or replace function public.customer_inbox_read(_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into public.customer_message_reads (message_id, user_id) select unnest(_ids), auth.uid() where auth.uid() is not null on conflict do nothing
$$;
revoke execute on function public.customer_inbox() from public, anon;
revoke execute on function public.customer_inbox_read(uuid[]) from public, anon;
grant execute on function public.customer_inbox() to authenticated;
grant execute on function public.customer_inbox_read(uuid[]) to authenticated;
do $$ begin alter publication supabase_realtime add table public.customer_messages; exception when duplicate_object then null; end $$;
drop policy if exists "Clients lisent les messages" on public.customer_messages;
create policy "Clients lisent les messages" on public.customer_messages for select using (auth.uid() is not null);

-- 9. Fonctions admin ------------------------------------------------------------------------------

-- Logistique : tout en un appel
create or replace function public.admin_logistics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'carriers', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'couriers', (select count(*) from couriers x where x.carrier_id = c.id),
        'active_couriers', (select count(*) from couriers x where x.carrier_id = c.id and x.status = 'active'),
        'deliveries', (select count(*) from deliveries d where d.carrier_id = c.id),
        'delivered', (select count(*) from deliveries d where d.carrier_id = c.id and d.status = 'delivered'),
        'zones', (select count(*) from delivery_zones z where z.carrier_id = c.id)) order by c.name) from carriers c), '[]'::jsonb),
    'couriers', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'carrier', (select name from carriers c where c.id = x.carrier_id),
        'total', (select count(*) from deliveries d where d.courier_id = x.id),
        'delivered', (select count(*) from deliveries d where d.courier_id = x.id and d.status = 'delivered'),
        'failed', (select count(*) from deliveries d where d.courier_id = x.id and d.status = 'failed'),
        'ongoing', (select count(*) from deliveries d where d.courier_id = x.id and d.status in ('assigned', 'picked_up', 'in_transit')),
        'delivered_30d', (select count(*) from deliveries d where d.courier_id = x.id and d.status = 'delivered' and d.delivered_at > now() - interval '30 days'),
        'avg_minutes', (select round(avg(extract(epoch from (d.delivered_at - d.assigned_at)) / 60)) from deliveries d where d.courier_id = x.id and d.status = 'delivered'),
        'earned', (select coalesce(sum(d.courier_pay), 0) from deliveries d where d.courier_id = x.id and d.status = 'delivered'),
        'paid', (select coalesce(sum(p.amount), 0) from courier_payouts p where p.courier_id = x.id),
        'cash_held', (select coalesce(sum(d.cash_collected), 0) from deliveries d where d.courier_id = x.id and d.status = 'delivered'),
        'incidents', (select count(*) from courier_incidents i where i.courier_id = x.id),
        'open_incidents', (select count(*) from courier_incidents i where i.courier_id = x.id and i.status = 'open'),
        'last_delivery', (select max(d.delivered_at) from deliveries d where d.courier_id = x.id)) order by x.full_name) from couriers x), '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('courier', x.full_name, 'courier_phone', x.phone, 'order_number', o.order_number) order by i.created_at desc)
        from courier_incidents i left join couriers x on x.id = i.courier_id left join orders o on o.id = i.order_id), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('courier', x.full_name) order by p.paid_at desc)
        from courier_payouts p join couriers x on x.id = p.courier_id), '[]'::jsonb));
end $$;

-- Colis : toutes les commandes avec leur livraison
create or replace function public.admin_parcels(_filter text default 'active') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object(
      'order_id', o.id, 'order_number', o.order_number, 'status', o.status, 'created_at', o.created_at,
      'customer', coalesce(o.full_name, 'Client'), 'phone', o.contact_phone, 'city', o.city, 'district', o.district,
      'address', o.address_details, 'gps', public.order_gps(o.address_details), 'total', o.total_fcfa, 'payment', o.payment_method,
      'shipping_fee', o.shipping_fee_fcfa,
      'items', (select count(*) from order_items oi where oi.order_id = o.id),
      'image', (select p.images->>0 from order_items oi join products p on p.id = oi.product_id where oi.order_id = o.id order by oi.created_at limit 1),
      'sellers', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', s.name, 'city', s.city)), '[]'::jsonb) from order_items oi join sellers s on s.id = oi.seller_id where oi.order_id = o.id),
      'delivery', (select to_jsonb(d) || jsonb_build_object('courier', c.full_name, 'courier_phone', c.phone, 'courier_photo', c.photo_url, 'vehicle', c.vehicle_type, 'carrier', ca.name)
                   from deliveries d left join couriers c on c.id = d.courier_id left join carriers ca on ca.id = d.carrier_id where d.order_id = o.id),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('label', e.label, 'at', e.created_at) order by e.created_at), '[]'::jsonb) from order_events e where e.order_id = o.id),
      'age_hours', round(extract(epoch from (now() - o.created_at)) / 3600)) x
    from orders o
    where (_filter = 'all')
       or (_filter = 'active' and o.status not in ('Annulée', 'Livrée'))
       or (_filter = 'unassigned' and o.status not in ('Annulée', 'Livrée') and not exists (select 1 from deliveries d where d.order_id = o.id))
       or (_filter = 'delivered' and o.status = 'Livrée')
       or (_filter = 'problem' and exists (select 1 from deliveries d where d.order_id = o.id and d.status = 'failed'))
    order by o.created_at desc limit 300) t), '[]'::jsonb);
end $$;

create or replace function public.admin_save_carrier(_c jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := nullif(_c->>'id', '')::uuid;
begin
  perform public.admin_guard();
  if coalesce(btrim(_c->>'name'), '') = '' then raise exception 'Indiquez le nom du transporteur.'; end if;
  if rid is null then
    insert into carriers (name, logo_url, contact_name, phone, email, city, address, cities, price_note, notes, is_active)
    values (btrim(_c->>'name'), nullif(_c->>'logo_url', ''), nullif(_c->>'contact_name', ''), nullif(_c->>'phone', ''), nullif(_c->>'email', ''),
      nullif(_c->>'city', ''), nullif(_c->>'address', ''), coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'cities') v), '{}'),
      nullif(_c->>'price_note', ''), nullif(_c->>'notes', ''), coalesce((_c->>'is_active')::boolean, true)) returning id into rid;
  else
    update carriers set name = btrim(_c->>'name'), logo_url = nullif(_c->>'logo_url', ''), contact_name = nullif(_c->>'contact_name', ''),
      phone = nullif(_c->>'phone', ''), email = nullif(_c->>'email', ''), city = nullif(_c->>'city', ''), address = nullif(_c->>'address', ''),
      cities = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'cities') v), '{}'), price_note = nullif(_c->>'price_note', ''),
      notes = nullif(_c->>'notes', ''), is_active = coalesce((_c->>'is_active')::boolean, is_active) where id = rid;
  end if;
  return rid;
exception when unique_violation then raise exception 'Ce transporteur existe déjà.';
end $$;

create or replace function public.admin_delete_carrier(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if exists (select 1 from deliveries where carrier_id = _id) then raise exception 'Ce transporteur a déjà effectué des livraisons : désactivez-le plutôt.'; end if;
  delete from carriers where id = _id;
end $$;

create or replace function public.admin_save_courier(_c jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := nullif(_c->>'id', '')::uuid;
begin
  perform public.admin_guard();
  if coalesce(btrim(_c->>'full_name'), '') = '' then raise exception 'Indiquez le nom du livreur.'; end if;
  if coalesce(btrim(_c->>'phone'), '') = '' then raise exception 'Indiquez le téléphone du livreur.'; end if;
  if rid is null then insert into couriers (full_name, phone) values (btrim(_c->>'full_name'), btrim(_c->>'phone')) returning id into rid; end if;
  update couriers set
    carrier_id = nullif(_c->>'carrier_id', '')::uuid, full_name = btrim(_c->>'full_name'), phone = btrim(_c->>'phone'),
    email = nullif(_c->>'email', ''), photo_url = nullif(_c->>'photo_url', ''), id_number = nullif(_c->>'id_number', ''),
    city = nullif(_c->>'city', ''), districts = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'districts') v), '{}'),
    vehicle_type = coalesce(nullif(_c->>'vehicle_type', ''), 'moto'), vehicle_brand = nullif(_c->>'vehicle_brand', ''),
    vehicle_plate = nullif(upper(_c->>'vehicle_plate'), ''), vehicle_color = nullif(_c->>'vehicle_color', ''),
    insurance_until = nullif(_c->>'insurance_until', '')::date, pay_per_delivery = coalesce(nullif(_c->>'pay_per_delivery', '')::int, 1000),
    work_days = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'work_days') v), work_days),
    work_start = coalesce(nullif(_c->>'work_start', '')::time, work_start), work_end = coalesce(nullif(_c->>'work_end', '')::time, work_end),
    status = coalesce(nullif(_c->>'status', ''), status), availability = coalesce(nullif(_c->>'availability', ''), availability),
    notes = nullif(_c->>'notes', '')
  where id = rid;
  return rid;
end $$;

create or replace function public.admin_set_courier(_id uuid, _field text, _value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _field = 'availability' then update couriers set availability = _value where id = _id;
  elsif _field = 'status' then update couriers set status = _value, availability = case when _value = 'suspended' then 'offline' else availability end where id = _id;
  else raise exception 'Champ inconnu'; end if;
end $$;

create or replace function public.admin_delete_courier(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if exists (select 1 from deliveries where courier_id = _id) then raise exception 'Ce livreur a déjà des livraisons : suspendez-le plutôt.'; end if;
  delete from couriers where id = _id;
end $$;

-- Affecter / faire avancer une livraison. Le statut de la commande suit (espace vendeur + suivi client).
create or replace function public.admin_assign_delivery(_order uuid, _courier uuid, _pay integer) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  perform public.admin_guard();
  select * into c from couriers where id = _courier;
  if c.id is null then raise exception 'Choisissez un livreur.'; end if;
  if c.status <> 'active' then raise exception 'Ce livreur est suspendu.'; end if;
  if exists (select 1 from orders where id = _order and status in ('Annulée', 'Livrée')) then raise exception 'Cette commande est déjà terminée.'; end if;
  insert into deliveries (order_id, courier_id, carrier_id, courier_pay, status)
  values (_order, _courier, c.carrier_id, coalesce(_pay, c.pay_per_delivery), 'assigned')
  on conflict (order_id) do update set courier_id = excluded.courier_id, carrier_id = excluded.carrier_id, courier_pay = excluded.courier_pay,
    status = 'assigned', assigned_at = now(), picked_at = null, failed_at = null, updated_at = now();
  update couriers set availability = 'busy' where id = _courier and availability = 'available';
  perform public.add_order_event(_order, 'courier_assigned', 'Livreur affecté : ' || split_part(c.full_name, ' ', 1));
end $$;

create or replace function public.admin_update_delivery(_order uuid, _status text, _note text, _cash integer) returns void
language plpgsql security definer set search_path = public as $$
declare d deliveries;
begin
  perform public.admin_guard();
  select * into d from deliveries where order_id = _order for update;
  if d.id is null then raise exception 'Aucun livreur affecté à cette commande.'; end if;
  if _status not in ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed') then raise exception 'Statut inconnu'; end if;
  update deliveries set status = _status, note = coalesce(nullif(btrim(_note), ''), note), updated_at = now(),
    picked_at = case when _status in ('picked_up', 'in_transit', 'delivered') then coalesce(picked_at, now()) else picked_at end,
    delivered_at = case when _status = 'delivered' then now() else delivered_at end,
    failed_at = case when _status = 'failed' then now() else null end,
    cash_collected = case when _status = 'delivered' then coalesce(_cash, cash_collected) else cash_collected end
  where id = d.id;
  if _status in ('picked_up', 'in_transit') then perform public.admin_set_order_status(_order, 'shipped'); end if;
  if _status = 'delivered' then
    perform public.admin_set_order_status(_order, 'delivered');
    update couriers set availability = 'available' where id = d.courier_id and availability = 'busy'
      and not exists (select 1 from deliveries x where x.courier_id = d.courier_id and x.status in ('assigned', 'picked_up', 'in_transit') and x.order_id <> _order);
  end if;
  if _status = 'failed' then perform public.add_order_event(_order, 'delivery_failed', 'Tentative de livraison échouée' || coalesce(' : ' || nullif(btrim(_note), ''), '')); end if;
end $$;

create or replace function public.admin_save_incident(_i jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := nullif(_i->>'id', '')::uuid;
begin
  perform public.admin_guard();
  if rid is null then
    insert into courier_incidents (courier_id, order_id, kind, severity, description)
    values (nullif(_i->>'courier_id', '')::uuid, (select id from orders where order_number = upper(btrim(_i->>'order_number'))),
      coalesce(nullif(_i->>'kind', ''), 'autre'), coalesce(nullif(_i->>'severity', ''), 'moyenne'), nullif(btrim(_i->>'description'), ''));
  else
    update courier_incidents set status = coalesce(nullif(_i->>'status', ''), status), resolution = coalesce(nullif(btrim(_i->>'resolution'), ''), resolution),
      resolved_at = case when _i->>'status' = 'resolved' then now() when _i->>'status' = 'open' then null else resolved_at end where id = rid;
  end if;
end $$;

create or replace function public.admin_pay_courier(_courier uuid, _amount integer, _method text, _ref text, _note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _amount is null or _amount <= 0 then raise exception 'Montant invalide.'; end if;
  insert into courier_payouts (courier_id, amount, method, reference, note) values (_courier, _amount, nullif(_method, ''), nullif(btrim(_ref), ''), nullif(btrim(_note), ''));
end $$;

-- Zones de livraison : quartiers + transporteur
drop function if exists public.admin_save_zone(uuid, text, int, int, int, boolean);
create or replace function public.admin_save_zone(_id uuid, _city text, _fee int, _free int, _days int, _active boolean, _districts text[] default '{}', _carrier uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if coalesce(btrim(_city), '') = '' then raise exception 'Choisissez la ville.'; end if;
  if _fee is null or _fee < 0 then raise exception 'Frais invalides.'; end if;
  if _id is null then
    insert into delivery_zones (city, fee, free_threshold, days, is_active, districts, carrier_id)
    values (btrim(_city), _fee, _free, _days, coalesce(_active, true), coalesce(_districts, '{}'), _carrier);
  else
    update delivery_zones set city = btrim(_city), fee = _fee, free_threshold = _free, days = _days, is_active = coalesce(_active, true),
      districts = coalesce(_districts, districts), carrier_id = _carrier where id = _id;
  end if;
exception when unique_violation then raise exception 'Cette ville a déjà un tarif.';
end $$;

-- Frais de livraison : statistiques réelles
create or replace function public.admin_shipping_stats(_from timestamptz, _to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'collected', (select coalesce(sum(shipping_fee_fcfa), 0) from orders where status <> 'Annulée' and created_at >= _from and created_at < _to),
    'orders', (select count(*) from orders where status <> 'Annulée' and created_at >= _from and created_at < _to),
    'free_orders', (select count(*) from orders where status <> 'Annulée' and shipping_fee_fcfa = 0 and created_at >= _from and created_at < _to),
    'courier_cost', (select coalesce(sum(d.courier_pay), 0) from deliveries d join orders o on o.id = d.order_id where d.status = 'delivered' and o.created_at >= _from and o.created_at < _to),
    'by_city', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'orders', n, 'collected', s, 'avg', a, 'free', f) order by n desc) from (
        select initcap(btrim(city)) city, count(*) n, sum(shipping_fee_fcfa) s, round(avg(shipping_fee_fcfa)) a, count(*) filter (where shipping_fee_fcfa = 0) f
        from orders where status <> 'Annulée' and created_at >= _from and created_at < _to and coalesce(btrim(city), '') <> '' group by 1) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('order_number', order_number, 'city', city, 'district', district, 'subtotal', subtotal_fcfa, 'fee', shipping_fee_fcfa, 'created_at', created_at) order by created_at desc)
        from (select * from orders where status <> 'Annulée' order by created_at desc limit 12) o), '[]'::jsonb));
end $$;

-- Bannières
create or replace function public.admin_banners() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order, b.created_at) from home_banners b), '[]'::jsonb);
end $$;
create or replace function public.admin_save_banner(_b jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := nullif(_b->>'id', '')::uuid;
begin
  perform public.admin_guard();
  if coalesce(_b->>'image_url', '') = '' then raise exception 'Ajoutez l''image de la bannière.'; end if;
  if nullif(_b->>'link_url', '') is not null and (_b->>'link_url') !~ '^(https?://|/)' then raise exception 'Le lien doit commencer par https:// ou par / (page du site).'; end if;
  if rid is null then
    if (select count(*) from home_banners) >= 6 then raise exception 'Maximum 6 bannières : supprimez-en une avant d''en ajouter une nouvelle.'; end if;
    insert into home_banners (image_url, mobile_image_url, link_url, title, is_active, starts_at, ends_at, sort_order)
    values (_b->>'image_url', nullif(_b->>'mobile_image_url', ''), nullif(btrim(_b->>'link_url'), ''), nullif(btrim(_b->>'title'), ''),
      coalesce((_b->>'is_active')::boolean, true), nullif(_b->>'starts_at', '')::timestamptz, nullif(_b->>'ends_at', '')::timestamptz,
      (select coalesce(max(sort_order), 0) + 1 from home_banners));
  else
    update home_banners set image_url = _b->>'image_url', mobile_image_url = nullif(_b->>'mobile_image_url', ''), link_url = nullif(btrim(_b->>'link_url'), ''),
      title = nullif(btrim(_b->>'title'), ''), is_active = coalesce((_b->>'is_active')::boolean, is_active),
      starts_at = nullif(_b->>'starts_at', '')::timestamptz, ends_at = nullif(_b->>'ends_at', '')::timestamptz where id = rid;
  end if;
end $$;
create or replace function public.admin_move_banner(_id uuid, _dir int) returns void
language plpgsql security definer set search_path = public as $$
declare me home_banners; other home_banners;
begin
  perform public.admin_guard();
  -- renumérote puis échange avec la voisine
  update home_banners b set sort_order = x.rn from (select id, row_number() over (order by sort_order, created_at) rn from home_banners) x where x.id = b.id;
  select * into me from home_banners where id = _id;
  select * into other from home_banners where sort_order = me.sort_order + sign(_dir)::int;
  if other.id is null then return; end if;
  update home_banners set sort_order = other.sort_order where id = me.id;
  update home_banners set sort_order = me.sort_order where id = other.id;
end $$;
create or replace function public.admin_delete_banner(_id uuid) returns void
language plpgsql security definer set search_path = public as $$ begin perform public.admin_guard(); delete from home_banners where id = _id; end $$;

-- Messages aux clients
create or replace function public.admin_messages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'messages', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('reads', (select count(*) from customer_message_reads r where r.message_id = m.id),
        'target_email', (select email from auth.users u where u.id = m.user_id)) order by m.created_at desc) from customer_messages m), '[]'::jsonb),
    'audience', jsonb_build_object('all', (select count(*) from profiles), 'prime', (select count(distinct user_id) from prime_subscriptions where is_active and expires_at > now()),
      'buyers', (select count(distinct user_id) from orders where status <> 'Annulée')));
end $$;
create or replace function public.admin_save_message(_m jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.admin_guard();
  if nullif(_m->>'id', '') is not null then
    update customer_messages set is_active = coalesce((_m->>'is_active')::boolean, is_active) where id = (_m->>'id')::uuid; return;
  end if;
  if coalesce(btrim(_m->>'title'), '') = '' or coalesce(btrim(_m->>'body'), '') = '' then raise exception 'Indiquez le titre et le message.'; end if;
  if _m->>'audience' = 'user' then
    select id into uid from auth.users where lower(email) = lower(btrim(_m->>'email'));
    if uid is null then raise exception 'Aucun compte client avec cet e-mail.'; end if;
  end if;
  insert into customer_messages (title, body, image_url, link_url, link_label, audience, user_id, starts_at, ends_at)
  values (btrim(_m->>'title'), btrim(_m->>'body'), nullif(_m->>'image_url', ''), nullif(btrim(_m->>'link_url'), ''), nullif(btrim(_m->>'link_label'), ''),
    coalesce(nullif(_m->>'audience', ''), 'all'), uid, coalesce(nullif(_m->>'starts_at', '')::timestamptz, now()), nullif(_m->>'ends_at', '')::timestamptz);
end $$;
create or replace function public.admin_delete_message(_id uuid) returns void
language plpgsql security definer set search_path = public as $$ begin perform public.admin_guard(); delete from customer_messages where id = _id; end $$;

-- Marketing créé par l'admin (au nom d'une boutique)
create or replace function public.admin_marketing_products() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price_fcfa, 'image', p.images->>0, 'seller_id', s.id, 'seller', s.name) order by s.name, p.title)
    from products p join sellers s on s.id = p.seller_id where p.is_published and s.is_active), '[]'::jsonb);
end $$;

create or replace function public.admin_save_coupon(_c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s sellers; _code text := upper(regexp_replace(coalesce(_c->>'code', ''), '\s', '', 'g'));
begin
  perform public.admin_guard();
  if nullif(_c->>'id', '') is not null then
    update seller_coupons set is_active = coalesce((_c->>'is_active')::boolean, is_active), updated_at = now() where id = (_c->>'id')::uuid; return;
  end if;
  select * into s from sellers where id = (_c->>'seller_id')::uuid;
  if s.id is null then raise exception 'Choisissez la boutique concernée.'; end if;
  if _code !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'Code invalide : 3 à 20 lettres ou chiffres.'; end if;
  if exists (select 1 from seller_coupons sc where upper(sc.code) = _code) then raise exception 'Ce code existe déjà.'; end if;
  insert into seller_coupons (owner_id, seller_id, code, kind, value, product_id, min_order_fcfa, max_uses, starts_at, ends_at, is_active)
  values (s.owner_id, s.id, _code, coalesce(nullif(_c->>'kind', ''), 'percent'), (_c->>'value')::int, nullif(_c->>'product_id', '')::uuid,
    coalesce(nullif(_c->>'min_order', '')::int, 0), nullif(_c->>'max_uses', '')::int, coalesce(nullif(_c->>'starts_at', '')::timestamptz, now()), nullif(_c->>'ends_at', '')::timestamptz, true);
end $$;

create or replace function public.admin_save_flash(_f jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform public.admin_guard();
  if nullif(_f->>'id', '') is not null then
    update seller_flash_sales set is_active = coalesce((_f->>'is_active')::boolean, is_active) where id = (_f->>'id')::uuid; return;
  end if;
  select pr.id, s.id sid, s.owner_id into p from products pr join sellers s on s.id = pr.seller_id where pr.id = (_f->>'product_id')::uuid;
  if p.id is null then raise exception 'Choisissez le produit.'; end if;
  insert into seller_flash_sales (owner_id, seller_id, product_id, kind, value, starts_at, ends_at, is_active)
  values (p.owner_id, p.sid, p.id, coalesce(nullif(_f->>'kind', ''), 'percent'), (_f->>'value')::int, coalesce(nullif(_f->>'starts_at', '')::timestamptz, now()), (_f->>'ends_at')::timestamptz, true);
end $$;

create or replace function public.admin_save_campaign(_c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform public.admin_guard();
  if nullif(_c->>'id', '') is not null then
    update seller_campaigns set status = coalesce(nullif(_c->>'status', ''), status) where id = (_c->>'id')::uuid; return;
  end if;
  select pr.id, s.id sid, s.owner_id into p from products pr join sellers s on s.id = pr.seller_id where pr.id = (_c->>'product_id')::uuid;
  if p.id is null then raise exception 'Choisissez le produit à mettre en avant.'; end if;
  if coalesce(btrim(_c->>'name'), '') = '' then raise exception 'Donnez un nom à la campagne.'; end if;
  insert into seller_campaigns (owner_id, seller_id, product_id, name, placement, daily_budget, starts_at, ends_at, status)
  values (p.owner_id, p.sid, p.id, btrim(_c->>'name'), coalesce(nullif(_c->>'placement', ''), 'all'), nullif(_c->>'daily_budget', '')::int,
    coalesce(nullif(_c->>'starts_at', '')::timestamptz, now()), nullif(_c->>'ends_at', '')::timestamptz, 'active');
end $$;

create or replace function public.admin_delete_marketing(_kind text, _id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _kind = 'coupon' then
    if exists (select 1 from seller_coupons c join orders o on o.coupon_code = c.code where c.id = _id) then raise exception 'Ce coupon a déjà été utilisé : désactivez-le plutôt.'; end if;
    delete from seller_coupons where id = _id;
  elsif _kind = 'flash' then delete from seller_flash_sales where id = _id;
  elsif _kind = 'campaign' then delete from seller_campaigns where id = _id;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_logistics()', 'admin_parcels(text)', 'admin_save_carrier(jsonb)', 'admin_delete_carrier(uuid)', 'admin_save_courier(jsonb)',
    'admin_set_courier(uuid,text,text)', 'admin_delete_courier(uuid)', 'admin_assign_delivery(uuid,uuid,integer)', 'admin_update_delivery(uuid,text,text,integer)',
    'admin_save_incident(jsonb)', 'admin_pay_courier(uuid,integer,text,text,text)', 'admin_save_zone(uuid,text,int,int,int,boolean,text[],uuid)',
    'admin_shipping_stats(timestamptz,timestamptz)', 'admin_banners()', 'admin_save_banner(jsonb)', 'admin_move_banner(uuid,int)', 'admin_delete_banner(uuid)',
    'admin_messages()', 'admin_save_message(jsonb)', 'admin_delete_message(uuid)', 'admin_marketing_products()', 'admin_save_coupon(jsonb)',
    'admin_save_flash(jsonb)', 'admin_save_campaign(jsonb)', 'admin_delete_marketing(text,uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Marketing : données complètes pour l'admin (images, conditions, budgets)
create or replace function public.admin_marketing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'kind', c.kind, 'value', c.value, 'is_active', c.is_active,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'seller', s.name, 'seller_logo', s.logo_url, 'min_order', c.min_order_fcfa, 'max_uses', c.max_uses,
        'product', p.title, 'product_image', p.images->>0,
        'uses', (select count(*) from orders o where o.coupon_code = c.code and o.status <> 'Annulée'),
        'discount_total', (select coalesce(sum(o.discount_fcfa), 0) from orders o where o.coupon_code = c.code and o.status <> 'Annulée')) order by c.created_at desc), '[]'::jsonb)
      from seller_coupons c left join sellers s on s.id = c.seller_id left join products p on p.id = c.product_id),
    'flash', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'value', f.value, 'is_active', f.is_active,
        'starts_at', f.starts_at, 'ends_at', f.ends_at, 'seller', s.name, 'product', p.title, 'image', p.images->>0, 'price', p.price_fcfa,
        'sold', (select coalesce(sum(oi.quantity), 0) from order_items oi where oi.product_id = f.product_id and oi.created_at between f.starts_at and f.ends_at)) order by f.starts_at desc), '[]'::jsonb)
      from seller_flash_sales f left join products p on p.id = f.product_id left join sellers s on s.id = p.seller_id),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'placement', c.placement, 'status', c.status, 'daily_budget', c.daily_budget,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'seller', s.name, 'product', p.title, 'image', p.images->>0,
        'impressions', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'impression'),
        'clicks', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'click'),
        'purchases', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'purchase')) order by c.created_at desc), '[]'::jsonb)
      from seller_campaigns c left join sellers s on s.id = c.seller_id left join products p on p.id = c.product_id)
  );
end $$;
