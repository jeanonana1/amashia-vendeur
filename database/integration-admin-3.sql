-- Amashia — Admin, étape 3 : tableau de bord sur une période libre, top 10 produits, performance vendeurs.
-- Lecture seule (aucune donnée modifiée). Heure du Cameroun (Africa/Douala) pour les regroupements.

-- Tableau de bord sur une période [_from, _to[ choisie par l'admin.
create or replace function public.admin_dashboard_range(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t_start timestamptz := coalesce(_from, date_trunc('day', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala');
  t_end timestamptz := least(coalesce(_to, now()), now() + interval '1 day');
  p_start timestamptz;
  span interval;
  bucket text;
  res jsonb;
begin
  perform public.admin_guard();
  if t_end <= t_start then raise exception 'Période invalide'; end if;
  if t_end - t_start > interval '3 years' then raise exception 'Période trop longue (3 ans maximum)'; end if;
  span := t_end - t_start;
  p_start := t_start - span;
  bucket := case when span <= interval '2 days' then 'hour' when span <= interval '92 days' then 'day' else 'month' end;
  with valid as (
    select o.id, o.created_at, o.total_fcfa from orders o where o.status <> 'Annulée'
  )
  select jsonb_build_object(
    'from', t_start, 'to', t_end, 'bucket', bucket,
    'revenue', (select coalesce(sum(total_fcfa), 0) from valid where created_at >= t_start and created_at < t_end),
    'revenue_prev', (select coalesce(sum(total_fcfa), 0) from valid where created_at >= p_start and created_at < t_start),
    'orders', (select count(*) from valid where created_at >= t_start and created_at < t_end),
    'orders_prev', (select count(*) from valid where created_at >= p_start and created_at < t_start),
    'cancelled', (select count(*) from orders where status = 'Annulée' and created_at >= t_start and created_at < t_end),
    'customers', (select count(*) from profiles),
    'new_customers', (select count(*) from profiles where created_at >= t_start and created_at < t_end),
    'buyers', (select count(distinct user_id) from orders where status <> 'Annulée' and created_at >= t_start and created_at < t_end),
    'sellers_active', (select count(*) from sellers where is_active),
    'products_published', (select count(*) from products where is_published),
    'visits', (select count(*) from shop_events where kind in ('shop', 'product') and created_at >= t_start and created_at < t_end),
    'visitors', (select count(distinct visitor_id) from shop_events where created_at >= t_start and created_at < t_end),
    'pending', jsonb_build_object(
      'orders_to_ship', (select count(distinct order_id) from order_items where seller_status in ('pending', 'preparing')),
      'reports', (select count(*) from product_reports where status = 'pending'),
      'returns', (select count(*) from return_requests where status = 'requested'),
      'withdrawals', (select count(*) from seller_withdrawals where status = 'pending'),
      'support', (select count(*) from seller_support_requests where status = 'open'),
      'applications', (select count(*) from job_applications where created_at >= now() - interval '30 days'),
      'kyc', (select count(*) from sellers where kyc_status = 'pending')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'revenue', (select coalesce(sum(total_fcfa), 0) from valid where date_trunc(bucket, created_at at time zone 'Africa/Douala') = b),
        'orders', (select count(*) from valid where date_trunc(bucket, created_at at time zone 'Africa/Douala') = b)
      ) order by b), '[]'::jsonb)
      from generate_series(date_trunc(bucket, t_start at time zone 'Africa/Douala'),
                           date_trunc(bucket, (t_end - interval '1 second') at time zone 'Africa/Douala'),
                           ('1 ' || bucket)::interval) b
    ),
    'recent_orders', (
      select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer', coalesce(o.full_name, p.full_name, 'Client'),
          'total', o.total_fcfa, 'status', o.status, 'city', o.city, 'created_at', o.created_at) x
        from orders o left join profiles p on p.id = o.user_id order by o.created_at desc limit 8
      ) t
    )
  ) into res;
  return res;
end $$;

-- 10 produits les plus vendus sur une période (chiffre d'affaires exact, net des réductions).
create or replace function public.admin_top_products(_from timestamptz, _to timestamptz, _limit int default 10)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(t order by (t->>'revenue')::numeric desc, (t->>'units')::int desc) from (
      select jsonb_build_object(
        'product_id', oi.product_id,
        'title', coalesce(min(pr.title), min(oi.product_title)),
        'slug', min(pr.slug), 'image', min(pr.images->>0),
        'seller', min(s.name),
        'units', sum(oi.quantity),
        'orders', count(distinct oi.order_id),
        'revenue', sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa))) t
      from order_items oi
      join orders o on o.id = oi.order_id
      left join products pr on pr.id = oi.product_id
      left join sellers s on s.id = pr.seller_id
      where o.status <> 'Annulée' and oi.seller_status <> 'cancelled'
        and o.created_at >= _from and o.created_at < _to
      group by oi.product_id
      order by sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) desc, sum(oi.quantity) desc
      limit greatest(1, least(coalesce(_limit, 10), 50))
    ) x), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_dashboard_range(timestamptz,timestamptz)', 'admin_top_products(timestamptz,timestamptz,int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Performance des vendeurs sur une période : ventes, commandes, logistique, qualité, trafic.
create or replace function public.admin_seller_performance(_from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare span interval := _to - _from; p_from timestamptz := _from - (_to - _from);
begin
  perform public.admin_guard();
  if _to <= _from then raise exception 'Période invalide'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'revenue')::numeric desc, x->>'name') from (
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'logo', s.logo_url, 'city', s.city, 'created_at', s.created_at,
      'is_active', s.is_active, 'kyc', s.kyc_status, 'followers', coalesce(s.followers, 0),
      'products_total', pc.total, 'products_published', pc.published, 'out_of_stock', pc.out_of_stock, 'low_stock', pc.low_stock,
      'revenue', coalesce(cur.revenue, 0), 'revenue_prev', coalesce(prev.revenue, 0),
      'orders', coalesce(cur.orders, 0), 'orders_prev', coalesce(prev.orders, 0), 'units', coalesce(cur.units, 0),
      'items', coalesce(cur.items, 0), 'cancelled', coalesce(cur.cancelled, 0), 'delivered', coalesce(cur.delivered, 0),
      'avg_ship_hours', cur.avg_ship_hours, 'avg_delivery_hours', cur.avg_delivery_hours,
      'to_ship', coalesce(q.to_ship, 0), 'late', coalesce(q.late, 0),
      'returns', (select count(*) from return_requests r where r.seller_id = s.id and r.created_at >= _from and r.created_at < _to),
      'reports', (select count(*) from product_reports r where r.seller_id = s.id and r.created_at >= _from and r.created_at < _to),
      'reports_pending', (select count(*) from product_reports r where r.seller_id = s.id and r.status = 'pending'),
      'rating', rv.rating, 'reviews', coalesce(rv.n, 0), 'reviews_period', coalesce(rv.n_period, 0),
      'visits', coalesce(tr.visits, 0), 'visitors', coalesce(tr.visitors, 0), 'carts', coalesce(tr.carts, 0),
      'buyers', coalesce(cur.buyers, 0),
      'last_sale', (select max(oi.created_at) from order_items oi where oi.seller_id = s.id and oi.seller_status <> 'cancelled'),
      'paid_out', (select coalesce(sum(amount), 0) from seller_withdrawals w where w.seller_id = s.id and w.status = 'paid'),
      'pending_payout', (select coalesce(sum(amount), 0) from seller_withdrawals w where w.seller_id = s.id and w.status = 'pending')
    ) x
    from sellers s
    left join lateral (
      select count(*) total, count(*) filter (where is_published) published,
             count(*) filter (where is_published and stock <= 0) out_of_stock,
             count(*) filter (where is_published and stock between 1 and 3) low_stock
      from products p where p.seller_id = s.id) pc on true
    left join lateral (
      select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) filter (where oi.seller_status <> 'cancelled' and o.status <> 'Annulée') revenue,
             count(distinct oi.order_id) filter (where oi.seller_status <> 'cancelled' and o.status <> 'Annulée') orders,
             count(distinct o.user_id) filter (where oi.seller_status <> 'cancelled' and o.status <> 'Annulée') buyers,
             sum(oi.quantity) filter (where oi.seller_status <> 'cancelled' and o.status <> 'Annulée') units,
             count(*) items,
             count(*) filter (where oi.seller_status = 'cancelled' or o.status = 'Annulée') cancelled,
             count(*) filter (where oi.seller_status = 'delivered') delivered,
             round(avg(extract(epoch from (oi.shipped_at - oi.created_at)) / 3600) filter (where oi.shipped_at is not null)::numeric, 1) avg_ship_hours,
             round(avg(extract(epoch from (oi.delivered_at - oi.created_at)) / 3600) filter (where oi.delivered_at is not null)::numeric, 1) avg_delivery_hours
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_id = s.id and oi.created_at >= _from and oi.created_at < _to) cur on true
    left join lateral (
      select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) revenue, count(distinct oi.order_id) orders
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_id = s.id and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'
        and oi.created_at >= p_from and oi.created_at < _from) prev on true
    left join lateral (
      select count(*) filter (where oi.seller_status in ('pending', 'preparing')) to_ship,
             count(*) filter (where oi.seller_status in ('pending', 'preparing') and oi.created_at < now() - interval '48 hours') late
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_id = s.id and o.status <> 'Annulée') q on true
    left join lateral (
      select round(avg(r.rating)::numeric, 1) rating, count(*) n,
             count(*) filter (where r.created_at >= _from and r.created_at < _to) n_period
      from reviews r join products p on p.id = r.product_id where p.seller_id = s.id) rv on true
    left join lateral (
      select count(*) filter (where kind in ('shop', 'product')) visits, count(distinct visitor_id) visitors,
             count(*) filter (where kind = 'cart') carts
      from shop_events e where e.seller_id = s.id and e.created_at >= _from and e.created_at < _to) tr on true
  ) t), '[]'::jsonb);
end $$;

-- Détail d'un vendeur : courbe des ventes, meilleurs produits, notes, dernières ventes.
create or replace function public.admin_seller_detail(_seller uuid, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare bucket text := case when _to - _from <= interval '2 days' then 'hour' when _to - _from <= interval '92 days' then 'day' else 'month' end;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'bucket', bucket,
    'series', (select coalesce(jsonb_agg(jsonb_build_object('at', b,
        'revenue', (select coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0)
                    from order_items oi join orders o on o.id = oi.order_id
                    where oi.seller_id = _seller and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'
                      and date_trunc(bucket, oi.created_at at time zone 'Africa/Douala') = b),
        'visits', (select count(*) from shop_events e where e.seller_id = _seller and e.kind in ('shop', 'product')
                      and date_trunc(bucket, e.created_at at time zone 'Africa/Douala') = b)) order by b), '[]'::jsonb)
      from generate_series(date_trunc(bucket, _from at time zone 'Africa/Douala'), date_trunc(bucket, (_to - interval '1 second') at time zone 'Africa/Douala'), ('1 ' || bucket)::interval) b),
    'top_products', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select jsonb_build_object('title', min(oi.product_title), 'image', min(p.images->>0), 'slug', min(p.slug), 'units', sum(oi.quantity),
          'revenue', sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa))) t
        from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
        where oi.seller_id = _seller and oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to
        group by oi.product_id order by sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) desc limit 5) x),
    'ratings', (select jsonb_object_agg(k, coalesce(n, 0)) from generate_series(1, 5) k left join (
        select r.rating, count(*) n from reviews r join products p on p.id = r.product_id where p.seller_id = _seller group by 1) c on c.rating = k),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('channel', ch, 'visits', n) order by n desc), '[]'::jsonb) from (
        select coalesce(nullif(channel, ''), 'direct') ch, count(*) n from shop_events e
        where e.seller_id = _seller and e.kind in ('shop', 'product') and e.created_at >= _from and e.created_at < _to group by 1) c),
    'recent', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select jsonb_build_object('order_number', o.order_number, 'title', oi.product_title, 'qty', oi.quantity, 'status', oi.seller_status,
          'amount', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa), 'city', o.city, 'created_at', oi.created_at) t
        from order_items oi join orders o on o.id = oi.order_id where oi.seller_id = _seller order by oi.created_at desc limit 8) x)
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_seller_performance(timestamptz,timestamptz)', 'admin_seller_detail(uuid,timestamptz,timestamptz)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Flux en direct : une ligne par minute pour l'heure en cours (60 lignes maximum, remis à zéro à chaque nouvelle heure).
create or replace function public.admin_live_minutes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h timestamptz := date_trunc('hour', now());
begin
  perform public.admin_guard();
  return jsonb_build_object('hour_start', h, 'now', now(), 'minutes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', m,
      'current', m = date_trunc('minute', now()),
      'visits', (select count(*) from shop_events e where e.kind in ('shop', 'product') and e.created_at >= m and e.created_at < m + interval '1 minute'),
      'visitors', (select count(distinct visitor_id) from shop_events e where e.created_at >= m and e.created_at < m + interval '1 minute'),
      'carts', (select count(*) from shop_events e where e.kind = 'cart' and e.created_at >= m and e.created_at < m + interval '1 minute'),
      'orders', (select count(*) from orders o where o.created_at >= m and o.created_at < m + interval '1 minute'),
      'revenue', (select coalesce(sum(total_fcfa), 0) from orders o where o.status <> 'Annulée' and o.created_at >= m and o.created_at < m + interval '1 minute'),
      'products', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
          select p.title t from shop_events e join products p on p.id = e.product_id
          where e.kind = 'product' and e.created_at >= m and e.created_at < m + interval '1 minute'
          group by p.title order by count(*) desc limit 3) x),
      'channels', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
          select distinct coalesce(nullif(channel, ''), 'direct') c from shop_events e
          where e.created_at >= m and e.created_at < m + interval '1 minute') x)
    ) order by m desc)
    from generate_series(h, date_trunc('minute', now()), interval '1 minute') m), '[]'::jsonb));
end $$;
revoke execute on function public.admin_live_minutes() from public, anon;
grant execute on function public.admin_live_minutes() to authenticated;
