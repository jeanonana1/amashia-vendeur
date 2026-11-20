-- Prime, page « Scanner » : tout code scanné (QR du client, QR d'un produit, code-barres SKU, numéro de commande)
-- affiche la commande correspondante et son statut. Limité aux commandes confiées à ce livreur.
create or replace function public.courier_scan_info(_value text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c couriers := current_courier(); v text := norm_code(_value); o orders; d deliveries; item order_items; what text;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  if v = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;

  -- 1) QR / numéro de commande / QR d'un produit
  select o2.* into o from orders o2 join deliveries d2 on d2.order_id = o2.id and d2.courier_id = c.id
    where norm_code(o2.order_number) = v or norm_code('AMASHIA' || o2.order_number || o2.delivery_code) = v or norm_code(o2.order_number || o2.delivery_code) = v
       or exists (select 1 from order_items i where i.order_id = o2.id and norm_code('AMASHIA' || o2.order_number || i.handover_code) = v)
    order by o2.created_at desc limit 1;
  if o.id is not null then
    what := 'order';
    select i.* into item from order_items i where i.order_id = o.id and norm_code('AMASHIA' || o.order_number || i.handover_code) = v limit 1;
    if item.id is not null then what := 'product_qr'; end if;
  else
    -- 2) code-barres (SKU) d'un produit : la commande la plus récente de ce livreur qui le contient
    select o2.* into o from orders o2 join deliveries d2 on d2.order_id = o2.id and d2.courier_id = c.id
      where exists (select 1 from order_items i where i.order_id = o2.id and norm_code(i.sku) = v)
      order by (d2.status in ('assigned', 'picked_up', 'in_transit')) desc, o2.created_at desc limit 1;
    if o.id is null then
      return jsonb_build_object('ok', false, 'error', 'Ce code ne correspond à aucune de vos courses.',
        'known_product', exists (select 1 from products p where norm_code(p.sku) = v));
    end if;
    what := 'barcode';
    select i.* into item from order_items i where i.order_id = o.id and norm_code(i.sku) = v limit 1;
  end if;

  select * into d from deliveries where order_id = o.id and courier_id = c.id;
  return jsonb_build_object(
    'ok', true, 'kind', what, 'order_id', o.id, 'order_number', mask_order_number(o.order_number),
    'order_status', o.status, 'delivery_status', d.status, 'admin_status', o.admin_status,
    'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'validated_at', d.validated_at, 'validation_method', d.validation_method,
    'customer', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'area', concat_ws(', ', nullif(o.district, ''), nullif(o.city, '')),
    'item', case when item.id is null then null else jsonb_build_object(
      'title', item.product_title, 'qty', item.quantity, 'sku', item.sku,
      'scanned', (select count(*) from delivery_item_scans s where s.order_item_id = item.id),
      'handed', exists (select 1 from delivery_item_handovers h where h.order_item_id = item.id),
      'image', (select p.images ->> 0 from products p where p.id = item.product_id)) end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.product_title, 'qty', i.quantity,
        'scanned', (select count(*) from delivery_item_scans s where s.order_item_id = i.id) >= greatest(i.quantity, 1),
        'handed', exists (select 1 from delivery_item_handovers h where h.order_item_id = i.id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'));
end $$;
grant execute on function public.courier_scan_info(text) to authenticated;
