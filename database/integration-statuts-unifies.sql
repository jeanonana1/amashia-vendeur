-- Statuts de commande identiques sur les 3 sites + l'application livreur Prime.
-- Une seule étape par commande (orders.step), calculée par la base, avec les mêmes libellés partout :
--   pending   = « Commande reçue »
--   preparing = « En préparation »
--   shipped   = « En cours de livraison »   (le livreur a récupéré le colis)
--   delivered = « Livrée »
--   cancelled = « Annulée »

alter table public.orders add column if not exists step text not null default 'pending';

create or replace function public.order_step_label(_step text) returns text language sql immutable as $$
  select case _step when 'pending' then 'Commande reçue' when 'preparing' then 'En préparation'
    when 'shipped' then 'En cours de livraison' when 'delivered' then 'Livrée' when 'cancelled' then 'Annulée' else _step end
$$;
grant execute on function public.order_step_label(text) to anon, authenticated;

-- l'étape suit toujours le statut de la commande et de ses articles
create or replace function public.trg_order_step() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.step := case
    when new.status = 'Annulée' then 'cancelled'
    when new.status = 'Livrée' then 'delivered'
    when new.status = 'Expédiée' then 'shipped'
    when tg_op = 'UPDATE' and exists (select 1 from order_items i where i.order_id = new.id and i.seller_status in ('preparing', 'shipped', 'delivered')) then 'preparing'
    else 'pending' end;
  return new;
end $$;
drop trigger if exists orders_step on public.orders;
create trigger orders_step before insert or update on public.orders for each row execute function public.trg_order_step();

-- libellés des étapes du suivi (timeline) identiques partout
create or replace function public.trg_item_status_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; c record; newst text;
begin
  if new.seller_status is not distinct from old.seller_status then return null; end if;
  select * into o from public.orders where id = new.order_id;
  if o.id is null or o.status = 'Annulée' then return null; end if;
  select count(*) filter (where seller_status <> 'cancelled') live,
         count(*) filter (where seller_status in ('pending','preparing')) prep,
         count(*) filter (where seller_status = 'shipped') ship
    into c from public.order_items where order_id = o.id;
  if c.live = 0 then newst := 'Annulée';
  elsif c.prep > 0 then newst := 'En préparation';
  elsif c.ship > 0 then newst := 'Expédiée';
  else newst := 'Livrée';
  end if;
  -- mise à jour systématique : recalcule aussi l'étape (Commande reçue → En préparation)
  update public.orders set status = newst, delivered_at = case when newst = 'Livrée' then coalesce(delivered_at, now()) else delivered_at end, updated_at = now() where id = o.id;
  if new.seller_status in ('preparing', 'shipped', 'delivered') then perform public.add_order_event(o.id, 'preparing', 'En préparation'); end if;
  if new.seller_status in ('shipped', 'delivered') then perform public.add_order_event(o.id, 'shipped', 'En cours de livraison'); end if;
  if newst = 'Livrée' then perform public.add_order_event(o.id, 'delivered', 'Livrée'); end if;
  if newst = 'Annulée' then perform public.add_order_event(o.id, 'cancelled', 'Annulée'); end if;
  return null;
end $$;

-- actions du livreur (Prime) → statut de la commande sur les 3 sites
create or replace function public.courier_set_order_status(_order uuid, _status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _status = 'preparing' then
    -- livreur affecté : la commande passe « En préparation » (récupération chez le vendeur)
    update order_items set seller_status = 'preparing' where order_id = _order and seller_status = 'pending';
    perform add_order_event(_order, 'preparing', 'En préparation');
    update orders set updated_at = now() where id = _order and status <> 'Annulée';
    return;
  end if;
  perform add_order_event(_order, 'preparing', 'En préparation');
  perform add_order_event(_order, 'shipped', 'En cours de livraison');
  if _status = 'delivered' then perform add_order_event(_order, 'delivered', 'Livrée'); end if;
  update order_items set seller_status = _status where order_id = _order and seller_status <> 'cancelled';
  update orders set status = case _status when 'delivered' then 'Livrée' else 'Expédiée' end,
    delivered_at = case when _status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    admin_status = _status, admin_status_at = now(), updated_at = now()
  where id = _order and status <> 'Annulée';
end $$;

-- admin : mêmes libellés
CREATE OR REPLACE FUNCTION public.admin_set_order_status(_order uuid, _status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.orders%rowtype;
  lbl text := case _status when 'pending' then 'Commande reçue' when 'preparing' then 'En préparation'
                           when 'shipped' then 'En cours de livraison' when 'delivered' then 'Livrée' when 'cancelled' then 'Annulée' end;
begin
  perform public.admin_guard('admin_set_order_status');
  if lbl is null then raise exception 'Statut inconnu'; end if;
  select * into o from public.orders where id = _order for update;
  if o.id is null then raise exception 'Commande introuvable'; end if;
  if o.status = 'Annulée' then raise exception 'Cette commande est annulée : son statut ne peut plus changer.'; end if;

  if _status = 'cancelled' then
    -- le statut global d'abord : les déclencheurs « vendeur » ignorent alors la commande annulée
    update public.orders set status = 'Annulée', updated_at = now() where id = _order;
    update public.order_items set seller_status = 'cancelled' where order_id = _order and seller_status <> 'cancelled';
    perform public.add_order_event(_order, 'cancelled', 'Annulée');
    insert into public.reward_transactions (user_id, points, type, description, order_id)
    select o.user_id, o.points_used, 'cancellation', 'Points rendus (commande annulée)', o.id
    where o.points_used > 0 and not exists (select 1 from public.reward_transactions r where r.order_id = o.id and r.type = 'cancellation');
  else
    -- historique de suivi dans l'ordre chronologique (le client le voit tel quel)
    if _status in ('preparing', 'shipped', 'delivered') then perform public.add_order_event(_order, 'preparing', 'En préparation'); end if;
    if _status in ('shipped', 'delivered') then perform public.add_order_event(_order, 'shipped', 'En cours de livraison'); end if;
    if _status = 'delivered' then perform public.add_order_event(_order, 'delivered', 'Livrée'); end if;
    update public.order_items set seller_status = _status where order_id = _order and seller_status <> 'cancelled';
    update public.orders set
      status = case _status when 'delivered' then 'Livrée' when 'shipped' then 'Expédiée' else 'En préparation' end,
      delivered_at = case when _status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
    where id = _order;
  end if;
  update public.orders set admin_status = _status, admin_status_at = now() where id = _order;
end $function$;

-- livreur qui accepte : commande « En préparation »
CREATE OR REPLACE FUNCTION public.courier_accept(_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c couriers := current_courier(); o orders; d deliveries;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into o from orders where id = _order for update;
  if o.id is null or o.status in ('Annulée', 'Livrée') then raise exception 'Cette commande n''est plus disponible.'; end if;
  select * into d from deliveries where order_id = _order for update;
  if d.id is not null and d.status in ('assigned', 'picked_up', 'in_transit', 'delivered') then
    if d.courier_id = c.id then return courier_order_json(o, d, true); end if;
    raise exception 'Trop tard : un autre livreur a déjà pris cette commande.';
  end if;
  if dispatch_eligible(o, c) is null then raise exception 'Cette commande est proposée en priorité à un livreur plus proche de la boutique.'; end if;
  insert into deliveries (order_id, courier_id, carrier_id, courier_pay, status)
  values (_order, c.id, c.carrier_id, c.pay_per_delivery, 'assigned')
  on conflict (order_id) do update set courier_id = excluded.courier_id, carrier_id = excluded.carrier_id, courier_pay = excluded.courier_pay,
    status = 'assigned', assigned_at = now(), picked_at = null, failed_at = null, updated_at = now()
  returning * into d;
  update couriers set availability = 'busy' where id = c.id and availability = 'available';
  perform add_order_event(_order, 'courier_assigned', 'Livreur affecté : ' || split_part(c.full_name, ' ', 1));
  perform courier_set_order_status(_order, 'preparing');
  return courier_order_json(o, d, true);
end $function$;

-- historique existant : mêmes libellés
update public.order_events set label = 'En préparation' where status = 'preparing';
update public.order_events set label = 'En cours de livraison' where status = 'shipped';
update public.order_events set label = 'Livrée' where status = 'delivered';
update public.order_events set label = 'Annulée' where status = 'cancelled';

-- étape des commandes existantes
update public.orders set updated_at = updated_at;

-- liste admin : étape commune
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
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'step', o.step, 'created_at', o.created_at,
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
