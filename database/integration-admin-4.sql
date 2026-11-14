-- Amashia — Admin, étape 4 : statut des commandes décidé par l'admin, image des commandes,
-- avis au client quand son signalement est résolu.

-- 1. Statut fixé par l'administration ----------------------------------------------------------
alter table public.orders add column if not exists admin_status text;
alter table public.orders add column if not exists admin_status_at timestamptz;

-- L'admin choisit le statut de toute la commande. Il s'applique à tous les articles
-- (donc à l'espace vendeur), et les déclencheurs existants mettent à jour le statut global
-- et l'historique de suivi (donc le site client).
create or replace function public.admin_set_order_status(_order uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
  lbl text := case _status when 'pending' then 'Commande reçue' when 'preparing' then 'En préparation'
                           when 'shipped' then 'Expédiée' when 'delivered' then 'Livrée' when 'cancelled' then 'Annulée' end;
begin
  perform public.admin_guard();
  if lbl is null then raise exception 'Statut inconnu'; end if;
  select * into o from public.orders where id = _order for update;
  if o.id is null then raise exception 'Commande introuvable'; end if;
  if o.status = 'Annulée' then raise exception 'Cette commande est annulée : son statut ne peut plus changer.'; end if;

  if _status = 'cancelled' then
    -- le statut global d'abord : les déclencheurs « vendeur » ignorent alors la commande annulée
    update public.orders set status = 'Annulée', updated_at = now() where id = _order;
    update public.order_items set seller_status = 'cancelled' where order_id = _order and seller_status <> 'cancelled';
    perform public.add_order_event(_order, 'cancelled', 'Commande annulée par Amashia');
  else
    -- historique de suivi dans l'ordre chronologique (le client le voit tel quel)
    if _status in ('preparing', 'shipped', 'delivered') then perform public.add_order_event(_order, 'preparing', 'En préparation chez le vendeur'); end if;
    if _status in ('shipped', 'delivered') then perform public.add_order_event(_order, 'shipped', 'Colis remis au livreur'); end if;
    if _status = 'delivered' then perform public.add_order_event(_order, 'delivered', 'Commande livrée'); end if;
    update public.order_items set seller_status = _status where order_id = _order and seller_status <> 'cancelled';
    update public.orders set
      status = case _status when 'delivered' then 'Livrée' when 'shipped' then 'Expédiée' else 'En préparation' end,
      delivered_at = case when _status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
    where id = _order;
  end if;
  update public.orders set admin_status = _status, admin_status_at = now() where id = _order;
end $$;
revoke execute on function public.admin_set_order_status(uuid, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text) to authenticated;

-- L'annulation existante passe aussi par cette décision (même effet partout).
create or replace function public.admin_cancel_order(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.admin_set_order_status(_id, 'cancelled'); end $$;

-- Le vendeur ne peut plus modifier une commande dont l'admin a fixé le statut.
create or replace function public.seller_set_order_status(_item_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _status not in ('pending', 'preparing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Statut invalide';
  end if;
  if exists (select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
             where oi.id = _item_id and o.admin_status is not null) then
    raise exception 'Le statut de cette commande a été fixé par l''administration Amashia : il ne peut plus être modifié.';
  end if;
  update public.order_items set seller_status = _status
  where id = _item_id and seller_id in (select id from public.sellers where owner_id = auth.uid());
  if not found then raise exception 'Commande introuvable ou non autorisée'; end if;
end $$;

-- 2. Liste des commandes : image du premier produit + statut admin --------------------------------
create or replace function public.admin_orders(_filter text default 'all', _q text default null, _limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'created_at', o.created_at,
        'customer', coalesce(o.full_name, p.full_name, 'Client'), 'email', coalesce(o.contact_email, p.email),
        'phone', coalesce(o.contact_phone, p.phone), 'city', o.city, 'district', o.district,
        'total', o.total_fcfa, 'discount', o.discount_fcfa, 'shipping', o.shipping_fee_fcfa, 'payment', o.payment_method,
        'channel', o.traffic_channel, 'admin_status', o.admin_status, 'admin_status_at', o.admin_status_at,
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
end $$;

-- Dernière commande reçue (pour l'alerte sonore de l'admin)
create or replace function public.admin_latest_order() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return (select jsonb_build_object('id', id, 'order_number', order_number, 'created_at', created_at, 'total', total_fcfa)
          from public.orders order by created_at desc limit 1);
end $$;
revoke execute on function public.admin_latest_order() from public, anon;
grant execute on function public.admin_latest_order() to authenticated;

-- 3. Signalement résolu : le client qui l'a envoyé est prévenu ------------------------------------
alter table public.product_reports add column if not exists resolved_at timestamptz;
alter table public.product_reports add column if not exists reporter_notified_at timestamptz;

create or replace function public.admin_update_report(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('pending', 'reviewed', 'resolved', 'dismissed') then raise exception 'Statut inconnu'; end if;
  update product_reports set status = _status, updated_at = now(),
    resolved_at = case when _status = 'resolved' then now() else null end,
    reporter_notified_at = case when _status = 'resolved' then null else reporter_notified_at end
  where id = _id;
end $$;

-- Le client voit ses signalements résolus pas encore affichés…
create or replace function public.customer_resolved_reports() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'resolved_at', r.resolved_at,
           'product_title', p.title, 'product_slug', coalesce(p.slug, p.id::text), 'product_image', p.images ->> 0)
         order by r.resolved_at), '[]'::jsonb)
  from public.product_reports r left join public.products p on p.id = r.product_id
  where r.reporter_id = auth.uid() and r.status = 'resolved' and r.reporter_notified_at is null
$$;
-- …et confirme qu'il a vu le message.
create or replace function public.customer_ack_reports(_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.product_reports set reporter_notified_at = now()
  where id = any(_ids) and reporter_id = auth.uid() and status = 'resolved'
$$;
revoke execute on function public.customer_resolved_reports() from public, anon;
revoke execute on function public.customer_ack_reports(uuid[]) from public, anon;
grant execute on function public.customer_resolved_reports() to authenticated;
grant execute on function public.customer_ack_reports(uuid[]) to authenticated;

-- 4. Correctif : le produit signalé est dans listing_id (fiche du site client) ; product_id désigne la fiche
--    de l'espace vendeur. Les jointures utilisaient la mauvaise colonne (photo et titre absents).
create or replace function public.admin_reports(_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', r.id, 'reason', r.reason, 'message', r.message, 'status', r.status, 'created_at', r.created_at,
        'resolved_at', r.resolved_at, 'reporter_notified_at', r.reporter_notified_at, 'has_account', r.reporter_id is not null,
        'reporter', r.reporter_name, 'reporter_contact', r.reporter_contact,
        'product_id', p.id, 'product_slug', coalesce(p.slug, p.id::text),
        'product_title', coalesce(p.title, sp.name, 'Produit supprimé'),
        'product_image', coalesce(p.images ->> 0, sp.images[1]),
        'price', p.price_fcfa, 'is_published', coalesce(p.is_published, false), 'seller', s.name,
        'reports_on_product', (select count(*) from product_reports r2 where r2.listing_id = r.listing_id)) x
      from product_reports r
      left join products p on p.id = r.listing_id
      left join seller_products sp on sp.id = r.product_id
      left join sellers s on s.id = p.seller_id
      where _status = 'all' or r.status = _status
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.customer_resolved_reports() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'resolved_at', r.resolved_at,
           'product_title', coalesce(p.title, 'le produit signalé'), 'product_slug', coalesce(p.slug, p.id::text), 'product_image', p.images ->> 0)
         order by r.resolved_at), '[]'::jsonb)
  from public.product_reports r left join public.products p on p.id = r.listing_id
  where r.reporter_id = auth.uid() and r.status = 'resolved' and r.reporter_notified_at is null
$$;

-- Même correctif dans les autres fonctions admin (produit = listing_id ; vendeur = compte propriétaire).
do $$
declare f text; def text;
begin
  foreach f in array array['admin_notifications()', 'admin_products(text,text)', 'admin_sellers()', 'admin_seller_performance(timestamptz,timestamptz)'] loop
    def := pg_get_functiondef(('public.' || f)::regprocedure);
    def := replace(def, 'left join products p on p.id = r.product_id', 'left join products p on p.id = r.listing_id');
    def := replace(def, 'product_reports pr where pr.product_id = p.id', 'product_reports pr where pr.listing_id = p.id');
    def := replace(def, 'pr2.seller_id = s.id', 'pr2.seller_id = s.owner_id');
    def := replace(def, 'product_reports r where r.seller_id = s.id', 'product_reports r where r.seller_id = s.owner_id');
    execute def;
  end loop;
end $$;

-- 5. Temps réel : le client qui a signalé un produit voit le message dès que l'admin le résout.
drop policy if exists "Reporters view own reports" on public.product_reports;
create policy "Reporters view own reports" on public.product_reports for select using (auth.uid() = reporter_id);
do $$ begin
  alter publication supabase_realtime add table public.product_reports;
exception when duplicate_object then null; end $$;

-- 6. Alerte sonore : dernière commande + nombre de commandes reçues depuis la dernière visite de la page Commandes.
drop function if exists public.admin_latest_order();
create or replace function public.admin_latest_order(_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'latest', (select created_at from public.orders order by created_at desc limit 1),
    'new_count', case when _since is null then 0 else (select count(*) from public.orders where created_at > _since) end);
end $$;
revoke execute on function public.admin_latest_order(timestamptz) from public, anon;
grant execute on function public.admin_latest_order(timestamptz) to authenticated;

-- 7. Temps réel des nouvelles commandes pour l'admin (lecture limitée par les règles existantes : l'admin voit tout).
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
