-- Site client : QR code de remise de chaque commande (à montrer au livreur à la livraison)
create or replace function public.customer_order_qr(_number text, _request text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'payload', 'AMASHIA|' || o.order_number || '|' || o.delivery_code,
    'needs_check', public.order_needs_handover_check(o),
    'delivered', o.status = 'Livrée', 'cancelled', o.status = 'Annulée')
  from public.orders o
  where upper(o.order_number) = upper(btrim(_number))
    and ((auth.uid() is not null and o.user_id = auth.uid()) or (coalesce(_request, '') <> '' and o.request_key::text = _request))
  limit 1;
$$;
grant execute on function public.customer_order_qr(text, text) to anon, authenticated;
