-- Contrôles du livreur : scans obligatoires avant récupération, validation de la remise avant « livré »
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
        and not exists (select 1 from delivery_item_scans s where s.order_item_id = i.id)) then
    raise exception 'Scannez d''abord le code-barres de chaque produit de la commande avant de confirmer la récupération.';
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
end $function$
;

-- Données envoyées à l'application livreur : numéro de commande masqué, état des scans et de la remise
CREATE OR REPLACE FUNCTION public.courier_order_json(o orders, d deliveries, _full boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', mask_order_number(o.order_number), 'created_at', o.created_at,
    'handover_check', order_needs_handover_check(o), 'validation_method', d.validation_method, 'validated_at', d.validated_at,
    'scan_total', (select count(*) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> ''),
    'scan_done', (select count(*) from order_items i join delivery_item_scans s on s.order_item_id = i.id where i.order_id = o.id and i.seller_status <> 'cancelled'),
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
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'has_sku', coalesce(i.sku, '') <> '', 'scanned', exists (select 1 from delivery_item_scans s where s.order_item_id = i.id), 'title', i.product_title, 'qty', i.quantity, 'price', i.unit_price_fcfa, 'color', i.color, 'size', i.size,
        'seller', (select s.name from sellers s where s.id = i.seller_id),
        'images', (select coalesce(jsonb_agg(v) filter (where v ~ '^https?://'), '[]'::jsonb) from products p, jsonb_array_elements_text(coalesce(p.images, '[]'::jsonb)) v where p.id = i.product_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$function$
;
