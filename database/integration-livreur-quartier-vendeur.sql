-- Livreur (Prime) : le quartier du vendeur est transmis avec chaque commande ; l'adresse de retrait n'affiche
-- plus de coordonnées brutes (« 3.84,11.50 ») mais « quartier, ville ».
create or replace function public.order_pickup(_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('seller_id', s.id, 'name', s.name, 'lat', s.pickup_lat, 'lng', s.pickup_lng,
    'district', sp.neighborhood,
    'address', coalesce(s.pickup_address,
      case when coalesce(sp.shop_address, '') ~ '^\s*-?[0-9.]+\s*,\s*-?[0-9.]+\s*$' then null else nullif(sp.shop_address, '') end,
      nullif(concat_ws(', ', sp.neighborhood, coalesce(sp.city, s.city)), ''), s.city),
    'city', coalesce(sp.city, s.city),
    'sellers', (select count(distinct i2.seller_id) from order_items i2 where i2.order_id = _order and i2.seller_status <> 'cancelled'))
  from order_items i join sellers s on s.id = i.seller_id left join seller_profiles sp on sp.id = s.owner_id
  where i.order_id = _order and i.seller_status <> 'cancelled'
  order by (s.pickup_lat is null), i.created_at limit 1;
$$;

CREATE OR REPLACE FUNCTION public.courier_order_json(o orders, d deliveries, _full boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', mask_order_number(o.order_number), 'created_at', o.created_at, 'order_status', o.status, 'admin_status', o.admin_status, 'admin_status_at', o.admin_status_at,
    'handover_check', order_needs_handover_check(o), 'validation_method', d.validation_method, 'validated_at', d.validated_at,
    'scan_total', (select coalesce(sum(greatest(i.quantity, 1)), 0) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> ''),
    'handover_total', (select count(*) from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'handover_done', (select count(*) from delivery_item_handovers h join order_items i on i.id = h.order_item_id where h.order_id = o.id and i.seller_status <> 'cancelled'),
    'scan_done', (select count(*) from order_items i join delivery_item_scans s on s.order_item_id = i.id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', nullif(btrim(o.full_name), ''),
    'customer_phone', case when _full then nullif(o.contact_phone, '') end,
    'has_customer_phone', coalesce(o.contact_phone, '') <> '',
    'masked_call', _full and d.status in ('assigned', 'picked_up', 'in_transit') and masked_calls_enabled() and coalesce(o.contact_phone, '') <> '',
    'contact_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'reason', q.reason, 'status', q.status, 'admin_note', q.admin_note, 'created_at', q.created_at, 'handled_at', q.handled_at) order by q.created_at desc), '[]'::jsonb)
      from courier_contact_requests q where q.order_id = o.id and q.courier_id = d.courier_id and q.created_at > now() - interval '3 days'),
    'pickup', order_pickup(o.id) - 'seller_id',
    'pickups', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', s.name, 'lat', s.pickup_lat, 'lng', s.pickup_lng, 'address', coalesce(s.pickup_address, nullif((select concat_ws(', ', sp.neighborhood, coalesce(sp.city, s.city)) from seller_profiles sp where sp.id = s.owner_id), ''), s.city), 'district', (select sp.neighborhood from seller_profiles sp where sp.id = s.owner_id))), '[]'::jsonb)
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
