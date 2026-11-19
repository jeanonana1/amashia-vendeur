-- Page de retour : uniquement les articles livrés depuis moins de 15 jours
CREATE OR REPLACE FUNCTION public.customer_returnable_items()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'ordered_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'item_id', oi.id, 'order_number', o.order_number, 'ordered_at', o.created_at, 'title', oi.product_title,
      'quantity', oi.quantity, 'amount', oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa, 'color', oi.color, 'options', oi.size,
      'image', (select p.images->>0 from public.products p where p.id = oi.product_id),
      'delivered_at', oi.delivered_at,
      'deadline', oi.delivered_at + interval '15 days',
      'eligible', (oi.seller_status = 'delivered' and o.status <> 'Annulée' and oi.delivered_at + interval '15 days' >= now()
                   and not exists (select 1 from public.return_requests r where r.order_item_id = oi.id and r.status <> 'refused')),
      'why_not', case
        when exists (select 1 from public.return_requests r where r.order_item_id = oi.id and r.status <> 'refused') then 'Un retour est déjà en cours pour cet article.'
        when o.status = 'Annulée' or oi.seller_status = 'cancelled' then 'Commande annulée.'
        when oi.seller_status <> 'delivered' then 'Le retour est possible une fois l''article livré.'
        when oi.delivered_at + interval '15 days' < now() then 'Le délai de 15 jours après la livraison est dépassé.'
        else null end) x
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.user_id = auth.uid()
      -- seuls les articles livrés depuis moins de 15 jours apparaissent (au-delà, retour et remboursement impossibles)
      and oi.seller_status = 'delivered' and o.status <> 'Annulée'
      and oi.delivered_at is not null and oi.delivered_at + interval '15 days' >= now()
  ) t;
$function$;
