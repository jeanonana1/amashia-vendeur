-- Un QR code par produit de la commande : le livreur scanne chaque produit remis au client (Yaoundé, Douala)
alter table public.order_items add column if not exists handover_code text;
create or replace function public.order_items_handover_code() returns trigger language plpgsql as $$
begin new.handover_code := coalesce(new.handover_code, upper(substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, 6))); return new; end $$;
drop trigger if exists order_items_handover_code on public.order_items;
create trigger order_items_handover_code before insert on public.order_items for each row execute function public.order_items_handover_code();
update public.order_items set handover_code = upper(substr(md5(random()::text || id::text), 1, 6)) where handover_code is null;

create table if not exists public.delivery_item_handovers (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid,
  method text not null check (method in ('qr', 'order_number', 'code')),
  handed_at timestamptz not null default now()
);
alter table public.delivery_item_handovers enable row level security; -- lecture via les fonctions uniquement

-- Le code (QR « AMASHIA|n°|code produit », code produit seul, QR de commande ou numéro) d'une commande déjà livrée ?
create or replace function public.courier_code_delivered(v text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o
    where (norm_code(o.order_number) = v or norm_code('AMASHIA' || o.order_number || o.delivery_code) = v or norm_code(o.order_number || o.delivery_code) = v
           or exists (select 1 from order_items i where i.order_id = o.id and norm_code('AMASHIA' || o.order_number || i.handover_code) = v))
      and (o.status = 'Livrée' or exists (select 1 from deliveries d where d.order_id = o.id and d.status = 'delivered')));
$$;
revoke all on function public.courier_code_delivered(text) from public, anon, authenticated;

create or replace function public.courier_lookup_code(_value text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c couriers := current_courier(); v text := norm_code(_value); r record;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  if v = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;
  if courier_code_delivered(v) then return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré.'); end if;
  select o.id, d.status into r from orders o join deliveries d on d.order_id = o.id and d.courier_id = c.id
    where norm_code(o.order_number) = v or norm_code('AMASHIA' || o.order_number || o.delivery_code) = v or norm_code(o.order_number || o.delivery_code) = v
       or exists (select 1 from order_items i where i.order_id = o.id and norm_code('AMASHIA' || o.order_number || i.handover_code) = v)
    limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Ce code ne correspond à aucune de vos courses.'); end if;
  return jsonb_build_object('ok', true, 'order_id', r.id, 'status', r.status);
end $$;
grant execute on function public.courier_lookup_code(text) to authenticated;

-- Remise au client : un scan par produit. Le numéro de commande / QR de commande ne valide qu'une commande d'un seul produit.
create or replace function public.courier_validate_handover(_order uuid, _value text, _method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); d deliveries; o orders; v text := norm_code(_value); it order_items;
  n_total int; n_done int; how text;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status = 'delivered' then return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré.'); end if;
  if d.status not in ('picked_up', 'in_transit') then raise exception 'Récupérez d''abord le colis chez le vendeur.'; end if;
  if _method not in ('qr', 'order_number') then raise exception 'Méthode de validation inconnue.'; end if;
  if v = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;
  select * into o from orders where id = _order;
  select count(*) into n_total from order_items i where i.order_id = _order and i.seller_status <> 'cancelled';

  -- 1) QR code (ou code à 6 caractères) d'un produit de la commande
  select i.* into it from order_items i where i.order_id = _order and i.seller_status <> 'cancelled'
    and (norm_code('AMASHIA' || o.order_number || i.handover_code) = v or norm_code(i.handover_code) = v) limit 1;
  if it.id is not null then
    how := case when _method = 'qr' then 'qr' else 'code' end;
  -- 2) QR de commande ou numéro de commande : accepté seulement pour une commande d'un seul produit
  elsif v = norm_code('AMASHIA' || o.order_number || o.delivery_code) or v = norm_code(o.order_number || o.delivery_code) or v = norm_code(o.order_number) then
    if n_total > 1 then
      return jsonb_build_object('ok', false, 'error', 'Cette commande contient ' || n_total || ' produits : scannez le QR code de chaque produit affiché par le client.');
    end if;
    select i.* into it from order_items i where i.order_id = _order and i.seller_status <> 'cancelled' limit 1;
    how := case when v = norm_code(o.order_number) then 'order_number' else 'qr' end;
  else
    if courier_code_delivered(v) then
      return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré. Ce QR code ne peut plus être utilisé.');
    end if;
    return jsonb_build_object('ok', false, 'error', case when _method = 'qr' then 'Ce QR code ne correspond à aucun produit de cette commande.' else 'Ce code ne correspond pas à cette commande.' end);
  end if;

  if exists (select 1 from delivery_item_handovers h where h.order_item_id = it.id) then
    return jsonb_build_object('ok', false, 'error', 'Ce produit a déjà été remis (' || it.product_title || '). Scannez le QR code du produit suivant.');
  end if;
  insert into delivery_item_handovers (order_item_id, order_id, courier_id, method) values (it.id, _order, c.id, how);
  select count(*) into n_done from delivery_item_handovers h join order_items i on i.id = h.order_item_id
    where h.order_id = _order and i.seller_status <> 'cancelled';
  if n_done >= n_total then
    update deliveries set validation_method = case when exists (select 1 from delivery_item_handovers h where h.order_id = _order and h.method = 'qr') then 'qr' else 'order_number' end,
      validated_at = now(), updated_at = now() where id = d.id;
    perform add_order_event(_order, 'handover_checked', 'Remise vérifiée : ' || n_total || ' produit' || case when n_total > 1 then 's' else '' end || ' scanné' || case when n_total > 1 then 's' else '' end || ' chez le client');
  end if;
  return jsonb_build_object('ok', true, 'method', how, 'title', it.product_title, 'done', n_done, 'total', n_total, 'complete', n_done >= n_total);
end $$;

-- QR codes du client : un par produit
create or replace function public.customer_order_qr(_number text, _request text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'payload', 'AMASHIA|' || o.order_number || '|' || o.delivery_code,
    'needs_check', public.order_needs_handover_check(o),
    'delivered', o.status = 'Livrée', 'cancelled', o.status = 'Annulée',
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', i.product_title, 'qty', i.quantity, 'color', i.color, 'size', i.size,
        'image', (select p.images ->> 0 from products p where p.id = i.product_id),
        'code', i.handover_code, 'payload', 'AMASHIA|' || o.order_number || '|' || i.handover_code,
        'handed', exists (select 1 from delivery_item_handovers h where h.order_item_id = i.id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'))
  from public.orders o
  where upper(o.order_number) = upper(btrim(_number))
    and ((auth.uid() is not null and o.user_id = auth.uid()) or (coalesce(_request, '') <> '' and o.request_key::text = _request))
  limit 1;
$$;

-- Prime / admin : remise produit par produit
CREATE OR REPLACE FUNCTION public.courier_order_json(o orders, d deliveries, _full boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', mask_order_number(o.order_number), 'created_at', o.created_at,
    'handover_check', order_needs_handover_check(o), 'validation_method', d.validation_method, 'validated_at', d.validated_at,
    'scan_total', (select coalesce(sum(greatest(i.quantity, 1)), 0) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> ''),
    'handover_total', (select count(*) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'handover_done', (select count(*) from delivery_item_handovers h join order_items i on i.id = h.order_item_id where h.order_id = o.id and i.seller_status <> 'cancelled'),
    'scan_done', (select count(*) from order_items i join delivery_item_scans s on s.order_item_id = i.id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', case when _full then o.full_name end,
    'customer_phone', case when _full then nullif(o.contact_phone, '') end,
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
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'has_sku', coalesce(i.sku, '') <> '', 'scanned', (select count(*) from delivery_item_scans s where s.order_item_id = i.id) >= greatest(i.quantity, 1), 'scanned_units', (select count(*) from delivery_item_scans s where s.order_item_id = i.id), 'handed', exists (select 1 from delivery_item_handovers h where h.order_item_id = i.id), 'title', i.product_title, 'qty', i.quantity, 'price', i.unit_price_fcfa, 'color', i.color, 'size', i.size,
        'seller', (select s.name from sellers s where s.id = i.seller_id),
        'images', (select coalesce(jsonb_agg(v) filter (where v ~ '^https?://'), '[]'::jsonb) from products p, jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) v where p.id = i.product_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$function$;

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

-- message de blocage de la livraison
CREATE OR REPLACE FUNCTION public.courier_update_delivery(_order uuid, _status text, _note text DEFAULT NULL::text, _cash integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c couriers := current_courier(); d deliveries; o orders;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id for update;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status in ('delivered') then raise exception 'Cette livraison est déjà terminée.'; end if;
  if _status not in ('picked_up', 'in_transit', 'delivered', 'failed') then raise exception 'Statut inconnu.'; end if;
  if _status = 'failed' and length(btrim(coalesce(_note, ''))) < 5 then raise exception 'Indiquez la raison de l''échec (client absent, adresse introuvable…).'; end if;
  select * into o from orders where id = _order;
  if o.status = 'Annulée' then raise exception 'Commande annulée par Amachia : ne la livrez pas.'; end if;
  -- récupération : chaque produit doit avoir été scanné (code-barres / SKU) chez le vendeur
  if _status in ('picked_up', 'in_transit') and d.status = 'assigned' and exists (
      select 1 from order_items i where i.order_id = _order and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> ''
        and (select count(*) from delivery_item_scans s where s.order_item_id = i.id) < greatest(i.quantity, 1)) then
    raise exception 'Scannez d''abord le code-barres de chaque produit (chaque exemplaire) de la commande avant de confirmer la récupération.';
  end if;
  -- remise au client (Yaoundé et Douala) : QR code du client ou numéro de commande obligatoire
  if _status = 'delivered' and order_needs_handover_check(o) and d.validated_at is null then
    raise exception 'Scannez le QR code de chaque produit affiché par le client (ou saisissez le code sous chaque QR code) avant de valider la livraison.';
  end if;
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
end $function$;
