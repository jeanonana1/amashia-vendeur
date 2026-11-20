-- Identifiant unique de chaque livreur + connexion à l'application Prime avec cet identifiant
-- + livreur de chaque commande dans l'admin (liste et détail).

-- 1) Identifiant unique : LIV-XXXXXX (lettres et chiffres sans ambiguïté : pas de 0/O, 1/I/L)
create or replace function public.new_courier_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare a text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text;
begin
  loop
    c := 'LIV-' || (select string_agg(substr(a, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(a)), 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from couriers where courier_code = c);
  end loop;
  return c;
end $$;

alter table public.couriers add column if not exists courier_code text;
update public.couriers set courier_code = public.new_courier_code() where courier_code is null;
alter table public.couriers alter column courier_code set default public.new_courier_code();
alter table public.couriers alter column courier_code set not null;
create unique index if not exists couriers_courier_code_key on public.couriers (courier_code);
alter table public.couriers add column if not exists code_attempts int not null default 0;
alter table public.couriers add column if not exists code_locked_until timestamptz;

-- 2) Sessions de l'application validées avec l'identifiant (une ligne par connexion)
create table if not exists public.courier_sessions (
  session_id uuid primary key,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.courier_sessions enable row level security; -- aucun accès direct

-- Un livreur n'est reconnu que si SA connexion a été validée avec son identifiant
create or replace function public.current_courier()
returns couriers language sql stable security definer set search_path = public as $$
  select c.* from couriers c
  where c.user_id = auth.uid() and c.status = 'active'
    and exists (select 1 from courier_sessions s where s.courier_id = c.id
                and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid)
  limit 1;
$$;

-- Vérification de l'identifiant après le mot de passe (5 essais, puis blocage 15 minutes)
create or replace function public.courier_verify_code(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c couriers; sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid; v text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g')); n int;
begin
  select * into c from couriers where user_id = auth.uid() limit 1;
  if c.id is null or sid is null then return jsonb_build_object('ok', false, 'reason', 'no_courier'); end if;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if c.code_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'until', c.code_locked_until); end if;
  -- « LIV-7K3P9Q », « liv7k3p9q » ou « 7K3P9Q » sont acceptés
  if v = '' or (v <> replace(c.courier_code, '-', '') and 'LIV' || v <> replace(c.courier_code, '-', '')) then
    n := c.code_attempts + 1;
    if n >= 5 then update couriers set code_attempts = 0, code_locked_until = now() + interval '15 minutes' where id = c.id;
    else update couriers set code_attempts = n where id = c.id; end if;
    return jsonb_build_object('ok', false, 'reason', case when n >= 5 then 'locked' else 'wrong' end, 'left', greatest(0, 5 - n));
  end if;
  update couriers set code_attempts = 0, code_locked_until = null where id = c.id;
  insert into courier_sessions (session_id, courier_id) values (sid, c.id) on conflict (session_id) do update set courier_id = excluded.courier_id, verified_at = now();
  delete from courier_sessions where courier_id = c.id and verified_at < now() - interval '90 days';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.courier_verify_code(text) from public, anon;
grant execute on function public.courier_verify_code(text) to authenticated;

-- Le fil des commandes et la position GPS passent aussi par la connexion validée
create or replace function public.courier_ping(_lat double precision, _lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier();
begin
  if _lat is null or _lng is null or c.id is null then return; end if;
  update couriers set last_lat = _lat, last_lng = _lng, last_loc_at = now(), last_seen_at = now() where id = c.id;
end $$;

drop policy if exists "livreur lit son fil" on public.courier_feed;
create policy "livreur lit son fil" on public.courier_feed for select to authenticated using (
  exists (select 1 from current_courier() c where c.id is not null and (courier_feed.courier_id = c.id
    or (courier_feed.courier_id is null and (c.city is null or lower(c.city) = lower(coalesce(courier_feed.city, c.city))))))
);

-- Les alertes en arrière-plan des téléphones déjà installés devront être réactivées après une connexion avec l'identifiant
delete from public.courier_devices;

-- 3) Admin : livreur de chaque commande
create or replace function public.order_courier_json(_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.courier_code, 'name', c.full_name, 'photo_url', c.photo_url, 'phone', c.phone, 'email', c.email,
    'city', c.city, 'districts', c.districts, 'vehicle_type', c.vehicle_type, 'vehicle_brand', c.vehicle_brand,
    'vehicle_plate', c.vehicle_plate, 'vehicle_color', c.vehicle_color, 'insurance_until', c.insurance_until,
    'status', c.status, 'availability', c.availability, 'carrier', (select name from carriers where id = c.carrier_id),
    'delivery_status', d.status, 'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at,
    'validation_method', d.validation_method, 'courier_pay', d.courier_pay,
    'total_delivered', (select count(*) from deliveries x where x.courier_id = c.id and x.status = 'delivered'),
    'since', c.created_at)
  from deliveries d join couriers c on c.id = d.courier_id
  where d.order_id = _order
  order by (d.status = 'delivered') desc, (d.status = 'failed') asc, d.assigned_at desc nulls last
  limit 1;
$$;
revoke all on function public.order_courier_json(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_orders(_filter text DEFAULT 'all'::text, _q text DEFAULT NULL::text, _limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.admin_guard('admin_orders');
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'step', o.step, 'courier_lock', public.order_courier_lock(o.id), 'created_at', o.created_at,
        'customer', coalesce(o.full_name, p.full_name, 'Client'), 'email', coalesce(o.contact_email, p.email),
        'phone', coalesce(o.contact_phone, p.phone), 'city', o.city, 'district', o.district,
        'total', o.total_fcfa, 'discount', o.discount_fcfa, 'shipping', o.shipping_fee_fcfa, 'payment', o.payment_method,
        'channel', o.traffic_channel, 'gps', public.order_gps(o.address_details), 'address_details', o.address_details, 'admin_status', o.admin_status, 'admin_status_at', o.admin_status_at,
        'items', (select count(*) from order_items oi where oi.order_id = o.id),
        'image', (select pr.images ->> 0 from order_items oi join products pr on pr.id = oi.product_id
                  where oi.order_id = o.id order by oi.created_at, oi.id limit 1),
        'first_title', (select oi.product_title from order_items oi where oi.order_id = o.id order by oi.created_at, oi.id limit 1),
        'sellers', (select coalesce(jsonb_agg(distinct s.name), '[]'::jsonb) from order_items oi join sellers s on s.id = oi.seller_id where oi.order_id = o.id),
        'returns', (select count(*) from return_requests r where r.order_id = o.id),
        'courier', (select jsonb_build_object('name', j->>'name', 'code', j->>'code', 'photo_url', j->>'photo_url', 'delivery_status', j->>'delivery_status') from public.order_courier_json(o.id) j),
        'validation_method', (select dl.validation_method from deliveries dl where dl.order_id = o.id and dl.validation_method is not null order by dl.validated_at desc limit 1)
      ) x
      from orders o left join profiles p on p.id = o.user_id
      where (_filter = 'all'
          or (_filter = 'cancelled' and o.status = 'Annulée')
          or (_filter = 'active' and o.status not in ('Annulée', 'Livrée'))
          or (_filter = 'delivered' and o.status = 'Livrée'))
        and (_q is null or _q = '' or o.order_number ilike '%' || _q || '%' or coalesce(o.full_name, p.full_name, '') ilike '%' || _q || '%' or coalesce(o.city, '') ilike '%' || _q || '%')
      order by o.created_at desc
      limit greatest(1, least(coalesce(_limit, 200), 500))
    ) t
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_order_detail(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.admin_guard('admin_order_detail');
  return (
    select jsonb_build_object(
      'order', to_jsonb(o) - 'request_key',
      'courier_lock', public.order_courier_lock(o.id),
      'courier', public.order_courier_json(o.id),
      'handover', (select jsonb_build_object('required', public.order_needs_handover_check(o), 'method', dl.validation_method, 'validated_at', dl.validated_at,
          'courier', (select c.full_name from couriers c where c.id = dl.courier_id), 'picked_at', dl.picked_at, 'delivered_at', dl.delivered_at)
        from deliveries dl where dl.order_id = o.id order by dl.assigned_at desc nulls last limit 1),
      'customer', jsonb_build_object('name', coalesce(o.full_name, p.full_name), 'email', coalesce(o.contact_email, p.email), 'phone', coalesce(o.contact_phone, p.phone)),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', oi.id, 'title', oi.product_title, 'quantity', oi.quantity, 'unit_price', oi.unit_price_fcfa, 'discount', oi.discount_fcfa,
          'status', oi.seller_status, 'sku', oi.sku, 'scanned_at', (select max(sc.scanned_at) from delivery_item_scans sc where sc.order_item_id = oi.id), 'scanned_units', (select count(*) from delivery_item_scans sc where sc.order_item_id = oi.id), 'handed_at', (select h.handed_at from delivery_item_handovers h where h.order_item_id = oi.id), 'color', oi.color, 'size', oi.size, 'seller', s.name, 'image', pr.images ->> 0,
          'shipped_at', oi.shipped_at, 'delivered_at', oi.delivered_at) order by oi.created_at), '[]'::jsonb)
        from order_items oi left join sellers s on s.id = oi.seller_id left join products pr on pr.id = oi.product_id where oi.order_id = o.id),
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from order_events e where e.order_id = o.id),
      'returns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb) from return_requests r where r.order_id = o.id)
    )
    from orders o left join profiles p on p.id = o.user_id where o.id = _id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_courier_activation(_courier uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare c couriers; code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  perform admin_guard('admin_courier_activation');
  select * into c from couriers where id = _courier;
  if c.id is null then raise exception 'Livreur introuvable.'; end if;
  if right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) !~ '^6\d{8}$' then raise exception 'Ajoutez d''abord un numéro de téléphone valide (9 chiffres, commence par 6) à ce livreur.'; end if;
  update couriers set activation_hash = encode(digest(code || ':' || id::text, 'sha256'), 'hex'), activation_expires = now() + interval '72 hours', activation_attempts = 0 where id = c.id;
  return jsonb_build_object('code', code, 'phone', c.phone, 'expires_at', now() + interval '72 hours', 'activated', c.user_id is not null, 'courier_code', c.courier_code);
end $function$;

-- correctif : commande sans livreur => courier null
CREATE OR REPLACE FUNCTION public.admin_orders(_filter text DEFAULT 'all'::text, _q text DEFAULT NULL::text, _limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.admin_guard('admin_orders');
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'step', o.step, 'courier_lock', public.order_courier_lock(o.id), 'created_at', o.created_at,
        'customer', coalesce(o.full_name, p.full_name, 'Client'), 'email', coalesce(o.contact_email, p.email),
        'phone', coalesce(o.contact_phone, p.phone), 'city', o.city, 'district', o.district,
        'total', o.total_fcfa, 'discount', o.discount_fcfa, 'shipping', o.shipping_fee_fcfa, 'payment', o.payment_method,
        'channel', o.traffic_channel, 'gps', public.order_gps(o.address_details), 'address_details', o.address_details, 'admin_status', o.admin_status, 'admin_status_at', o.admin_status_at,
        'items', (select count(*) from order_items oi where oi.order_id = o.id),
        'image', (select pr.images ->> 0 from order_items oi join products pr on pr.id = oi.product_id
                  where oi.order_id = o.id order by oi.created_at, oi.id limit 1),
        'first_title', (select oi.product_title from order_items oi where oi.order_id = o.id order by oi.created_at, oi.id limit 1),
        'sellers', (select coalesce(jsonb_agg(distinct s.name), '[]'::jsonb) from order_items oi join sellers s on s.id = oi.seller_id where oi.order_id = o.id),
        'returns', (select count(*) from return_requests r where r.order_id = o.id),
        'courier', (select case when j is null then null else jsonb_build_object('name', j->>'name', 'code', j->>'code', 'photo_url', j->>'photo_url', 'delivery_status', j->>'delivery_status') end from public.order_courier_json(o.id) j),
        'validation_method', (select dl.validation_method from deliveries dl where dl.order_id = o.id and dl.validation_method is not null order by dl.validated_at desc limit 1)
      ) x
      from orders o left join profiles p on p.id = o.user_id
      where (_filter = 'all'
          or (_filter = 'cancelled' and o.status = 'Annulée')
          or (_filter = 'active' and o.status not in ('Annulée', 'Livrée'))
          or (_filter = 'delivered' and o.status = 'Livrée'))
        and (_q is null or _q = '' or o.order_number ilike '%' || _q || '%' or coalesce(o.full_name, p.full_name, '') ilike '%' || _q || '%' or coalesce(o.city, '') ilike '%' || _q || '%')
      order by o.created_at desc
      limit greatest(1, least(coalesce(_limit, 200), 500))
    ) t
  ), '[]'::jsonb);
end $function$;
