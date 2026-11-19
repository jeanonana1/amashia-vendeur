-- ═══ Application livreur : scan des produits à la récupération, validation de la remise au client ═══
create or replace function public.mask_order_number(n text) returns text language sql immutable as $$
  select case when coalesce(n, '') = '' then '' else regexp_replace(n, '^(.{4}).*(.{2})$', '\1••••••\2') end;
$$;
create or replace function public.norm_code(v text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(v, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Le livreur scanne le code-barres (SKU) d'un produit chez le vendeur
create or replace function public.courier_scan_item(_order uuid, _code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); d deliveries; it order_items; code text := norm_code(_code); n_total int; n_done int;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if d.status <> 'assigned' then raise exception 'Les produits de cette commande ont déjà été récupérés.'; end if;
  if code = '' then return jsonb_build_object('ok', false, 'error', 'Code illisible : scannez à nouveau.'); end if;
  -- un article de cette commande pas encore scanné, sinon un article déjà scanné (même produit en plusieurs exemplaires)
  select i.* into it from order_items i where i.order_id = _order and i.seller_status <> 'cancelled' and norm_code(i.sku) = code
    order by (exists (select 1 from delivery_item_scans s where s.order_item_id = i.id)), i.created_at limit 1;
  if it.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ce n''est pas le bon produit : il ne fait pas partie de cette commande. Scannez un autre produit.');
  end if;
  insert into delivery_item_scans (order_item_id, order_id, courier_id, scanned_code) values (it.id, _order, c.id, code)
    on conflict (order_item_id) do nothing;
  select count(*), count(s.order_item_id) into n_total, n_done from order_items i left join delivery_item_scans s on s.order_item_id = i.id
    where i.order_id = _order and i.seller_status <> 'cancelled' and coalesce(i.sku, '') <> '';
  return jsonb_build_object('ok', true, 'title', it.product_title, 'qty', it.quantity, 'scanned', n_done, 'total', n_total, 'complete', n_done >= n_total);
end $$;

-- Le livreur valide la remise : QR code du client ou numéro de commande (scanné ou saisi)
create or replace function public.courier_validate_handover(_order uuid, _value text, _method text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); d deliveries; o orders; v text := norm_code(_value); ok boolean := false;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
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
    return jsonb_build_object('ok', false, 'error', case when _method = 'qr' then 'Ce QR code ne correspond pas à cette commande.' else 'Ce numéro de commande ne correspond pas à cette commande.' end);
  end if;
  update deliveries set validation_method = _method, validated_at = now(), updated_at = now() where id = d.id;
  perform add_order_event(_order, 'handover_checked', case when _method = 'qr' then 'Remise vérifiée par le QR code du client' else 'Remise vérifiée par le numéro de commande du client' end);
  return jsonb_build_object('ok', true, 'method', _method);
end $$;

grant execute on function public.courier_scan_item(uuid, text) to authenticated;
grant execute on function public.courier_validate_handover(uuid, text, text) to authenticated;
