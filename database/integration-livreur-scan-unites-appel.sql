-- Prime : scan exemplaire par exemplaire, numéro du client pour l'appeler, QR code déjà livré
alter table public.delivery_item_scans add column if not exists unit int not null default 1;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'delivery_item_scans_pkey') then
    alter table public.delivery_item_scans drop constraint delivery_item_scans_pkey;
  end if;
  alter table public.delivery_item_scans add constraint delivery_item_scans_pkey primary key (order_item_id, unit);
end $$;

-- Vrai si le code (QR « AMASHIA|n°|code » ou numéro de commande) appartient à une commande déjà livrée
create or replace function public.courier_code_delivered(v text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o
    where (norm_code(o.order_number) = v or norm_code('AMASHIA' || o.order_number || o.delivery_code) = v or norm_code(o.order_number || o.delivery_code) = v)
      and (o.status = 'Livrée' or exists (select 1 from deliveries d where d.order_id = o.id and d.status = 'delivered')));
$$;
revoke all on function public.courier_code_delivered(text) from public, anon, authenticated;

-- Scan libre depuis l'écran Scanner (sans course choisie) : à quelle course correspond ce QR code ?
create or replace function public.courier_lookup_code(_value text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c couriers := current_courier(); v text := norm_code(_value); r record;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  if v = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;
  if courier_code_delivered(v) then return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré.'); end if;
  select o.id, d.status into r from orders o join deliveries d on d.order_id = o.id and d.courier_id = c.id
    where norm_code(o.order_number) = v or norm_code('AMASHIA' || o.order_number || o.delivery_code) = v or norm_code(o.order_number || o.delivery_code) = v
    limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Ce code ne correspond à aucune de vos courses.'); end if;
  return jsonb_build_object('ok', true, 'order_id', r.id, 'status', r.status);
end $$;
grant execute on function public.courier_lookup_code(text) to authenticated;

CREATE OR REPLACE FUNCTION public.courier_scan_item(_order uuid, _code text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c couriers := current_courier(); d deliveries; it order_items; code text := norm_code(_code); n_total int; n_done int; n_item int;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status <> 'assigned' then raise exception 'Les produits de cette commande ont déjà été récupérés.'; end if;
  if code = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;
  -- produit de la commande avec ce code-barres
  select i.* into it from order_items i where i.order_id = _order and i.seller_status <> 'cancelled' and norm_code(i.sku) = code
    order by ((select count(*) from delivery_item_scans s where s.order_item_id = i.id) >= greatest(i.quantity, 1)), i.created_at limit 1;
  if it.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ce n''est pas le bon produit : il ne fait pas partie de cette commande. Scannez un autre produit.');
  end if;
  select count(*) into n_item from delivery_item_scans where order_item_id = it.id;
  if n_item >= greatest(it.quantity, 1) then
    return jsonb_build_object('ok', false, 'error', 'Ce produit a déjà été scanné (' || n_item || '/' || greatest(it.quantity, 1) || '). Scannez le produit suivant de la commande.');
  end if;
  -- un exemplaire de plus (1/3, 2/3, 3/3)
  insert into delivery_item_scans (order_item_id, unit, order_id, courier_id, scanned_code) values (it.id, n_item + 1, _order, c.id, code)
    on conflict do nothing;
  select coalesce(sum(greatest(i.quantity, 1)), 0) into n_total from order_items i
    where i.order_id = _order and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> '';
  select count(*) into n_done from delivery_item_scans s join order_items i on i.id = s.order_item_id
    where i.order_id = _order and i.seller_status <> 'cancelled';
  return jsonb_build_object('ok', true, 'title', it.product_title, 'qty', it.quantity, 'unit', n_item + 1,
    'scanned', n_done, 'total', n_total, 'complete', n_done >= n_total);
end $function$;

CREATE OR REPLACE FUNCTION public.courier_validate_handover(_order uuid, _value text, _method text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c couriers := current_courier(); d deliveries; o orders; v text := norm_code(_value); ok boolean := false;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status = 'delivered' then return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré.'); end if;
  if d.status not in ('picked_up', 'in_transit') then raise exception 'Récupérez d''abord le colis chez le vendeur.'; end if;
  if _method not in ('qr', 'order_number') then raise exception 'Méthode de validation inconnue.'; end if;
  select * into o from orders where id = _order;
  if _method = 'qr' then
    -- QR code : « AMASHIA|<numéro de commande>|<code de remise> »
    ok := v = norm_code('AMASHIA' || o.order_number || o.delivery_code) or v = norm_code(o.order_number || o.delivery_code);
  else
    ok := v <> '' and v = norm_code(o.order_number);
  end if;
  if not ok then
    -- QR code / numéro d'une commande déjà livrée
    if courier_code_delivered(v) then
      return jsonb_build_object('ok', false, 'delivered', true, 'error', 'Ce colis a déjà été livré. Ce QR code ne peut plus être utilisé.');
    end if;
    return jsonb_build_object('ok', false, 'error', case when _method = 'qr' then 'Ce QR code ne correspond pas à cette commande.' else 'Ce numéro de commande ne correspond pas à cette commande.' end);
  end if;
  update deliveries set validation_method = _method, validated_at = now(), updated_at = now() where id = d.id;
  perform add_order_event(_order, 'handover_checked', case when _method = 'qr' then 'Remise vérifiée par le QR code du client' else 'Remise vérifiée par le numéro de commande du client' end);
  return jsonb_build_object('ok', true, 'method', _method);
end $function$;

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
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'has_sku', coalesce(i.sku, '') <> '', 'scanned', (select count(*) from delivery_item_scans s where s.order_item_id = i.id) >= greatest(i.quantity, 1), 'scanned_units', (select count(*) from delivery_item_scans s where s.order_item_id = i.id), 'title', i.product_title, 'qty', i.quantity, 'price', i.unit_price_fcfa, 'color', i.color, 'size', i.size,
        'seller', (select s.name from sellers s where s.id = i.seller_id),
        'images', (select coalesce(jsonb_agg(v) filter (where v ~ '^https?://'), '[]'::jsonb) from products p, jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) v where p.id = i.product_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$function$;

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
    raise exception 'Scannez le QR code du client ou saisissez son numéro de commande avant de valider la livraison.';
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
          'status', oi.seller_status, 'sku', oi.sku, 'scanned_at', (select max(sc.scanned_at) from delivery_item_scans sc where sc.order_item_id = oi.id), 'scanned_units', (select count(*) from delivery_item_scans sc where sc.order_item_id = oi.id), 'color', oi.color, 'size', oi.size, 'seller', s.name, 'image', pr.images ->> 0,
          'shipped_at', oi.shipped_at, 'delivered_at', oi.delivered_at) order by oi.created_at), '[]'::jsonb)
        from order_items oi left join sellers s on s.id = oi.seller_id left join products pr on pr.id = oi.product_id where oi.order_id = o.id),
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from order_events e where e.order_id = o.id),
      'returns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb) from return_requests r where r.order_id = o.id)
    )
    from orders o left join profiles p on p.id = o.user_id where o.id = _id
  );
end $function$;
