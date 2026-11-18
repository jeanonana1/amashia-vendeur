-- Une fois que le livreur a traité une commande, son statut ne peut plus revenir en arrière
-- (ni depuis l'admin, ni depuis l'espace vendeur). Livrée par le livreur = statut définitif.

create or replace function public.courier_progress(_order uuid) returns int
language sql stable security definer set search_path = public as $$
  -- 0 = pas encore traité ; 2 = colis récupéré / en route ; 3 = livré
  select coalesce(max(case d.status when 'delivered' then 3 when 'picked_up' then 2 when 'in_transit' then 2 else 0 end), 0)
  from deliveries d where d.order_id = _order;
$$;

create or replace function public.trg_item_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p int; rk_old int; rk_new int;
begin
  if new.seller_status is not distinct from old.seller_status then return new; end if;
  p := courier_progress(new.order_id);
  if p = 0 then return new; end if;
  rk_old := case old.seller_status when 'pending' then 0 when 'preparing' then 1 when 'shipped' then 2 when 'delivered' then 3 else -1 end;
  rk_new := case new.seller_status when 'pending' then 0 when 'preparing' then 1 when 'shipped' then 2 when 'delivered' then 3 else -1 end;
  if p = 3 and new.seller_status <> 'delivered' then raise exception 'Commande livrée par le livreur : son statut est définitif et ne peut plus être modifié.'; end if;
  if new.seller_status = 'cancelled' or rk_new < rk_old or rk_new < p then
    raise exception 'Le livreur a déjà récupéré cette commande : son statut ne peut plus revenir en arrière.';
  end if;
  return new;
end $$;
drop trigger if exists item_status_guard on public.order_items;
create trigger item_status_guard before update of seller_status on public.order_items for each row execute function public.trg_item_status_guard();

create or replace function public.trg_order_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p int; rk_old int; rk_new int;
begin
  if new.status is not distinct from old.status then return new; end if;
  p := courier_progress(new.id);
  if p = 0 then return new; end if;
  rk_old := case old.status when 'En préparation' then 1 when 'Expédiée' then 2 when 'Livrée' then 3 else -1 end;
  rk_new := case new.status when 'En préparation' then 1 when 'Expédiée' then 2 when 'Livrée' then 3 else -1 end;
  if p = 3 and new.status <> 'Livrée' then raise exception 'Commande livrée par le livreur : son statut est définitif et ne peut plus être modifié.'; end if;
  if new.status = 'Annulée' or rk_new < rk_old then
    raise exception 'Le livreur a déjà récupéré cette commande : son statut ne peut plus revenir en arrière.';
  end if;
  return new;
end $$;
drop trigger if exists order_status_guard on public.orders;
create trigger order_status_guard before update of status on public.orders for each row execute function public.trg_order_status_guard();

-- pour l'admin : la commande est-elle verrouillée par le livreur ?
create or replace function public.order_courier_lock(_order uuid) returns text
language sql stable security definer set search_path = public as $$
  select case courier_progress(_order) when 3 then 'delivered' when 2 then 'picked' else null end;
$$;
grant execute on function public.order_courier_lock(uuid) to authenticated;

-- liste admin : commandes verrouillées par le livreur
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
        'returns', (select count(*) from return_requests r where r.order_id = o.id)
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

-- détail admin
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
      'customer', jsonb_build_object('name', coalesce(o.full_name, p.full_name), 'email', coalesce(o.contact_email, p.email), 'phone', coalesce(o.contact_phone, p.phone)),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', oi.id, 'title', oi.product_title, 'quantity', oi.quantity, 'unit_price', oi.unit_price_fcfa, 'discount', oi.discount_fcfa,
          'status', oi.seller_status, 'color', oi.color, 'size', oi.size, 'seller', s.name, 'image', pr.images ->> 0,
          'shipped_at', oi.shipped_at, 'delivered_at', oi.delivered_at) order by oi.created_at), '[]'::jsonb)
        from order_items oi left join sellers s on s.id = oi.seller_id left join products pr on pr.id = oi.product_id where oi.order_id = o.id),
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from order_events e where e.order_id = o.id),
      'returns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb) from return_requests r where r.order_id = o.id)
    )
    from orders o left join profiles p on p.id = o.user_id where o.id = _id
  );
end $function$;
