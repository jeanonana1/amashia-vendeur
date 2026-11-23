-- Site vendeur : le montant total des commissions reversées à Amachia n'est plus transmis ; seuls les taux par catégorie restent visibles.
begin;
CREATE OR REPLACE FUNCTION public.seller_commissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sid uuid;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then raise exception 'Boutique introuvable'; end if;
  return jsonb_build_object(
    'balance', public.seller_available_balance(sid), 'enabled', public.commissions_enabled(),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'pct', c.commission_pct) order by c.sort_order) from categories c where c.parent_id is null), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'gross', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0),
        'delivered_net', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status = 'delivered'), 0),
        'pending_net', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status in ('pending','preparing','shipped')), 0))
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_id = sid and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'),
    'withdrawn', (select coalesce(sum(amount), 0) from seller_withdrawals where seller_id = sid and status in ('pending', 'paid')),
    'refunds', (select coalesce(sum(public.return_seller_cost(r)), 0) from return_requests r where r.seller_id = sid),
    'items', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('order_number', o.order_number, 'title', oi.product_title, 'qty', oi.quantity, 'status', oi.seller_status,
        'category', coalesce(c.name, p.category_slug), 'image', p.images->>0, 'created_at', oi.created_at,
        'gross', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa), 'pct', oi.commission_pct,
        'net', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) x
      from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id left join categories c on c.slug = p.category_slug
      where oi.seller_id = sid and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'
      order by oi.created_at desc limit 200) t), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.seller_dashboard_stats(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
  d int := case when _days in (1, 7, 30, 365) then _days else 30 end;
  t_start timestamptz;
  p_start timestamptz;
  bucket text;
  res jsonb;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then return null; end if;
  t_start := case when d = 1 then date_trunc('day', now()) else now() - make_interval(days => d) end;
  p_start := t_start - (now() - t_start);
  bucket := case when d = 1 then 'hour' when d = 365 then 'month' else 'day' end;

  with items as (
    select oi.*, o.user_id, o.status as order_status, ((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0))) as amount
    from order_items oi join orders o on o.id = oi.order_id
    where oi.seller_id = sid
  ),
  valid as (select * from items where order_status <> 'Annulée' and seller_status <> 'cancelled'),
  ev as (select * from shop_events where seller_id = sid),
  buckets as (
    select generate_series(date_trunc(bucket, t_start), date_trunc(bucket, now()), ('1 ' || bucket)::interval) as b
  )
  select jsonb_build_object(
    'days', d,
    'balance', public.seller_available_balance(sid),
    'withdrawn', (select coalesce(sum(amount), 0) from seller_withdrawals where seller_id = sid and status in ('pending', 'paid')),
    'pending_balance', (select coalesce(sum(amount - public.item_commission(unit_price_fcfa, quantity, discount_fcfa, commission_pct)), 0) from valid where seller_status in ('pending', 'preparing', 'shipped')), -- net_pending
    'revenue', (select coalesce(sum(amount), 0) from valid where created_at >= t_start),
    'revenue_prev', (select coalesce(sum(amount), 0) from valid where created_at >= p_start and created_at < t_start),
    'orders', (select count(distinct order_id) from valid where created_at >= t_start),
    'orders_prev', (select count(distinct order_id) from valid where created_at >= p_start and created_at < t_start),
    'customers', (select count(distinct user_id) from valid where created_at >= t_start),
    'customers_prev', (select count(distinct user_id) from valid where created_at >= p_start and created_at < t_start),
    'products', (select count(*) from seller_products where user_id = auth.uid()),
    'products_online', (select count(*) from products where seller_id = sid and is_published),
    'visits', (select count(*) from ev where kind in ('shop', 'product') and created_at >= t_start),
    'visits_prev', (select count(*) from ev where kind in ('shop', 'product') and created_at >= p_start and created_at < t_start),
    'visitors', (select count(distinct visitor_id) from ev where created_at >= t_start),
    'visits_today', (select count(*) from ev where kind in ('shop', 'product') and created_at >= date_trunc('day', now())),
    'shop_views', (select count(*) from ev where kind = 'shop' and created_at >= t_start),
    'product_views', (select count(*) from ev where kind = 'product' and created_at >= t_start),
    'cart_adds', (select count(*) from ev where kind = 'cart' and created_at >= t_start),
    'funnel', jsonb_build_object(
      'visitors', (select count(distinct visitor_id) from ev where created_at >= t_start),
      'product_viewers', (select count(distinct visitor_id) from ev where kind = 'product' and created_at >= t_start),
      'cart_adders', (select count(distinct visitor_id) from ev where kind = 'cart' and created_at >= t_start),
      'buyers', (select count(distinct user_id) from valid where created_at >= t_start)
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'views', (select count(*) from ev where kind in ('shop', 'product') and date_trunc(bucket, created_at) = b),
        'carts', (select count(*) from ev where kind = 'cart' and date_trunc(bucket, created_at) = b),
        'orders', (select count(distinct order_id) from valid where date_trunc(bucket, created_at) = b),
        'revenue', (select coalesce(sum(amount), 0) from valid where date_trunc(bucket, created_at) = b)
      ) order by b), '[]'::jsonb) from buckets
    ),
    'top_products', (
      select coalesce(jsonb_agg(t order by (t->>'revenue')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('title', min(product_title), 'quantity', sum(quantity), 'revenue', sum(amount)) t
        from valid where created_at >= t_start group by product_id order by sum(amount) desc limit 5
      ) x
    ),
    'followers', (select count(*) from seller_followers where seller_id = sid),
    'rating', (select round(avg(r.rating)::numeric, 1) from reviews r join products p on p.id = r.product_id where p.seller_id = sid),
    'reviews', (select count(*) from reviews r join products p on p.id = r.product_id where p.seller_id = sid),
    'shop', (select jsonb_build_object('id', id, 'slug', slug, 'name', name) from sellers where id = sid)
  ) into res;
  return res;
end $function$;
commit;
