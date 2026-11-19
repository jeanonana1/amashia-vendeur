-- Admin : méthode de validation de la livraison (QR code / numéro de commande) et scans des produits
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
          'status', oi.seller_status, 'sku', oi.sku, 'scanned_at', (select sc.scanned_at from delivery_item_scans sc where sc.order_item_id = oi.id), 'color', oi.color, 'size', oi.size, 'seller', s.name, 'image', pr.images ->> 0,
          'shipped_at', oi.shipped_at, 'delivered_at', oi.delivered_at) order by oi.created_at), '[]'::jsonb)
        from order_items oi left join sellers s on s.id = oi.seller_id left join products pr on pr.id = oi.product_id where oi.order_id = o.id),
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from order_events e where e.order_id = o.id),
      'returns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb) from return_requests r where r.order_id = o.id)
    )
    from orders o left join profiles p on p.id = o.user_id where o.id = _id
  );
end $function$
;

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
end $function$
;
