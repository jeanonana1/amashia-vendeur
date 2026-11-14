-- ============================================================================
-- Espace admin Amashia : fonctions réservées aux administrateurs (rôle « admin »
-- dans user_roles). Chaque fonction vérifie le rôle avant de lire ou modifier.
-- ============================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.admin_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs.' using errcode = '42501'; end if;
end $$;

-- Montant net d'une ligne de commande (après réduction)
create or replace function public.item_net(_price int, _qty int, _disc int) returns numeric
language sql immutable as $$ select (_price * coalesce(_qty, 1) - coalesce(_disc, 0))::numeric $$;

-- ---------------------------------------------------------------- Tableau de bord
create or replace function public.admin_dashboard(_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := case when _days in (1, 7, 30, 365) then _days else 30 end;
  t_start timestamptz := case when d = 1 then date_trunc('day', now()) else now() - make_interval(days => d) end;
  p_start timestamptz;
  bucket text := case when d = 1 then 'hour' when d = 365 then 'month' else 'day' end;
  res jsonb;
begin
  perform public.admin_guard();
  p_start := t_start - (now() - t_start);
  with valid as (
    select o.id, o.created_at, o.user_id, o.total_fcfa from orders o where o.status <> 'Annulée'
  )
  select jsonb_build_object(
    'days', d,
    'revenue', (select coalesce(sum(total_fcfa), 0) from valid where created_at >= t_start),
    'revenue_prev', (select coalesce(sum(total_fcfa), 0) from valid where created_at >= p_start and created_at < t_start),
    'orders', (select count(*) from valid where created_at >= t_start),
    'orders_prev', (select count(*) from valid where created_at >= p_start and created_at < t_start),
    'customers', (select count(*) from profiles),
    'new_customers', (select count(*) from profiles where created_at >= t_start),
    'sellers_active', (select count(*) from sellers where is_active),
    'products_published', (select count(*) from products where is_published),
    'visits', (select count(*) from shop_events where kind in ('shop', 'product') and created_at >= t_start),
    'visitors', (select count(distinct visitor_id) from shop_events where created_at >= t_start),
    'pending', jsonb_build_object(
      'orders_to_ship', (select count(distinct order_id) from order_items where seller_status in ('pending', 'preparing')),
      'reports', (select count(*) from product_reports where status = 'pending'),
      'returns', (select count(*) from return_requests where status = 'requested'),
      'withdrawals', (select count(*) from seller_withdrawals where status = 'pending'),
      'support', (select count(*) from seller_support_requests where status = 'open'),
      'applications', (select count(*) from job_applications where created_at >= now() - interval '30 days')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'revenue', (select coalesce(sum(total_fcfa), 0) from valid where date_trunc(bucket, created_at) = b),
        'orders', (select count(*) from valid where date_trunc(bucket, created_at) = b)
      ) order by b), '[]'::jsonb)
      from generate_series(date_trunc(bucket, t_start), date_trunc(bucket, now()), ('1 ' || bucket)::interval) b
    ),
    'recent_orders', (
      select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer', coalesce(o.full_name, p.full_name, 'Client'),
          'total', o.total_fcfa, 'status', o.status, 'city', o.city, 'created_at', o.created_at) x
        from orders o left join profiles p on p.id = o.user_id order by o.created_at desc limit 8
      ) t
    ),
    'top_products', (
      select coalesce(jsonb_agg(t order by (t->>'revenue')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('title', min(oi.product_title), 'units', sum(oi.quantity), 'revenue', sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa))) t
        from order_items oi join orders o on o.id = oi.order_id
        where o.status <> 'Annulée' and oi.seller_status <> 'cancelled' and oi.created_at >= t_start
        group by oi.product_id order by sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) desc limit 5
      ) x
    )
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------- Commandes
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
        'channel', o.traffic_channel,
        'items', (select count(*) from order_items oi where oi.order_id = o.id),
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

create or replace function public.admin_order_detail(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return (
    select jsonb_build_object(
      'order', to_jsonb(o) - 'request_key',
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
end $$;

-- Annulation d'une commande par l'admin (tous les articles non livrés sont annulés)
create or replace function public.admin_cancel_order(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  update order_items set seller_status = 'cancelled' where order_id = _id and seller_status not in ('delivered', 'cancelled');
  update orders set status = 'Annulée', updated_at = now() where id = _id and status <> 'Livrée'
    and not exists (select 1 from order_items where order_id = _id and seller_status = 'delivered');
end $$;

-- ---------------------------------------------------------------- Retours
create or replace function public.admin_returns(_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', r.id, 'ref', r.ref, 'order_number', o.order_number, 'product_title', r.product_title, 'quantity', r.quantity,
        'amount', r.amount, 'reason', r.reason, 'details', r.details, 'solution', r.solution, 'photos', r.photos, 'status', r.status,
        'seller_note', r.seller_note, 'seller', s.name, 'customer', coalesce(o.full_name, p.full_name), 'created_at', r.created_at, 'updated_at', r.updated_at) x
      from return_requests r left join orders o on o.id = r.order_id left join sellers s on s.id = r.seller_id left join profiles p on p.id = r.user_id
      where _status = 'all' or r.status = _status
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_update_return(_id uuid, _status text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('requested', 'accepted', 'refused', 'received', 'refunded') then raise exception 'Statut inconnu'; end if;
  update return_requests set status = _status, seller_note = coalesce(nullif(trim(_note), ''), seller_note), updated_at = now() where id = _id;
end $$;

-- ---------------------------------------------------------------- Vendeurs
create or replace function public.admin_sellers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug, 'logo_url', s.logo_url, 'city', s.city, 'is_active', s.is_active,
        'created_at', s.created_at, 'followers', s.followers,
        'owner_name', coalesce(nullif(trim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')), ''), pr.full_name),
        'owner_email', u.email, 'owner_phone', sp.phone, 'niu', sp.niu,
        'products', (select count(*) from products p where p.seller_id = s.id and p.is_published),
        'orders', (select count(distinct oi.order_id) from order_items oi where oi.seller_id = s.id and oi.seller_status <> 'cancelled'),
        'revenue', (select coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0) from order_items oi join orders o on o.id = oi.order_id where oi.seller_id = s.id and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'),
        'rating', (select round(avg(r.rating)::numeric, 1) from reviews r join products p on p.id = r.product_id where p.seller_id = s.id),
        'reports', (select count(*) from product_reports pr2 where pr2.seller_id = s.id and pr2.status = 'pending')
      ) x
      from sellers s
      left join auth.users u on u.id = s.owner_id
      left join seller_profiles sp on sp.id = s.owner_id
      left join profiles pr on pr.id = s.owner_id
    ) t
  ), '[]'::jsonb);
end $$;

-- Suspendre / réactiver une boutique (ses produits sont retirés / remis en ligne)
create or replace function public.admin_set_seller_active(_id uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  update sellers set is_active = _active, updated_at = now() where id = _id;
  if not _active then
    update products set is_published = false where seller_id = _id;
  else
    update products p set is_published = true
    from seller_products sp where sp.marketplace_product_id = p.id and p.seller_id = _id and sp.status = 'active';
  end if;
end $$;

-- ---------------------------------------------------------------- Retraits des vendeurs
create or replace function public.admin_withdrawals(_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', w.id, 'amount', w.amount, 'method', w.method, 'status', w.status, 'note', w.note,
        'created_at', w.created_at, 'processed_at', w.processed_at, 'seller', s.name, 'seller_id', s.id,
        'phone', sp.phone, 'payment_method', sp.payment_method,
        'balance', public.seller_available_balance(s.id)) x
      from seller_withdrawals w left join sellers s on s.id = w.seller_id left join seller_profiles sp on sp.id = w.user_id
      where _status = 'all' or w.status = _status
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_update_withdrawal(_id uuid, _status text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('pending', 'paid', 'rejected') then raise exception 'Statut inconnu'; end if;
  update seller_withdrawals set status = _status, note = coalesce(nullif(trim(_note), ''), note),
    processed_at = case when _status = 'pending' then null else now() end
  where id = _id;
end $$;

-- ---------------------------------------------------------------- Produits
create or replace function public.admin_products(_q text default null, _filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', p.id, 'slug', coalesce(p.slug, p.id::text), 'title', p.title, 'image', p.images ->> 0,
        'price', p.price_fcfa, 'original_price', p.original_price_fcfa, 'stock', p.stock, 'category', p.category_slug,
        'subcategory', p.subcategory_slug, 'is_published', p.is_published, 'created_at', p.created_at,
        'seller', s.name, 'seller_id', s.id,
        'sold', (select coalesce(sum(oi.quantity), 0) from order_items oi where oi.product_id = p.id and oi.seller_status <> 'cancelled'),
        'reviews', (select count(*) from reviews r where r.product_id = p.id),
        'rating', (select round(avg(r.rating)::numeric, 1) from reviews r where r.product_id = p.id),
        'reports', (select count(*) from product_reports pr where pr.product_id = p.id and pr.status = 'pending')) x
      from products p left join sellers s on s.id = p.seller_id
      where (_q is null or _q = '' or p.title ilike '%' || _q || '%' or coalesce(s.name, '') ilike '%' || _q || '%')
        and (_filter = 'all' or (_filter = 'published' and p.is_published) or (_filter = 'hidden' and not p.is_published)
             or (_filter = 'out_of_stock' and p.stock <= 0))
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_product_published(_id uuid, _published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  update products set is_published = _published, updated_at = now() where id = _id;
end $$;

-- ---------------------------------------------------------------- Signalements
create or replace function public.admin_reports(_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', r.id, 'reason', r.reason, 'message', r.message, 'status', r.status, 'created_at', r.created_at,
        'reporter', r.reporter_name, 'reporter_contact', r.reporter_contact,
        'product_id', p.id, 'product_slug', coalesce(p.slug, p.id::text), 'product_title', p.title, 'product_image', p.images ->> 0,
        'is_published', p.is_published, 'seller', s.name) x
      from product_reports r left join products p on p.id = r.product_id left join sellers s on s.id = coalesce(r.seller_id, p.seller_id)
      where _status = 'all' or r.status = _status
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_update_report(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('pending', 'reviewed', 'resolved', 'dismissed') then raise exception 'Statut inconnu'; end if;
  update product_reports set status = _status, updated_at = now() where id = _id;
end $$;

-- ---------------------------------------------------------------- Clients
create or replace function public.admin_customers(_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, u.email), 'email', coalesce(p.email, u.email), 'phone', p.phone,
        'city', p.city, 'district', p.district, 'created_at', coalesce(p.created_at, u.created_at), 'last_sign_in', u.last_sign_in_at,
        'is_seller', exists (select 1 from sellers s where s.owner_id = p.id),
        'is_admin', public.has_role(p.id, 'admin'),
        'orders', (select count(*) from orders o where o.user_id = p.id and o.status <> 'Annulée'),
        'spent', (select coalesce(sum(o.total_fcfa), 0) from orders o where o.user_id = p.id and o.status <> 'Annulée'),
        'last_order', (select max(o.created_at) from orders o where o.user_id = p.id),
        'reviews', (select count(*) from reviews r where r.user_id = p.id),
        'points', (select coalesce(sum(t.points), 0) from reward_transactions t where t.user_id = p.id)) x
      from profiles p left join auth.users u on u.id = p.id
      where _q is null or _q = '' or coalesce(p.full_name, '') ilike '%' || _q || '%' or coalesce(p.email, u.email, '') ilike '%' || _q || '%' or coalesce(p.phone, '') ilike '%' || _q || '%'
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- Avis
create or replace function public.admin_reviews()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'comment', r.comment, 'author', r.author_name,
        'verified', r.is_verified_purchase, 'photos', r.photos, 'created_at', r.created_at,
        'product_title', p.title, 'product_slug', coalesce(p.slug, p.id::text), 'seller', s.name) x
      from reviews r left join products p on p.id = r.product_id left join sellers s on s.id = p.seller_id
    ) t
  ), '[]'::jsonb);
end $$;

-- Modération : retirer un avis contraire aux règles (injurieux, faux…)
create or replace function public.admin_delete_review(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  delete from reviews where id = _id;
end $$;

-- ---------------------------------------------------------------- Activité en direct
create or replace function public.admin_live()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'visitors_5min', (select count(distinct visitor_id) from shop_events where created_at > now() - interval '5 minutes'),
    'visitors_30min', (select count(distinct visitor_id) from shop_events where created_at > now() - interval '30 minutes'),
    'visits_today', (select count(*) from shop_events where kind in ('shop', 'product') and created_at >= date_trunc('day', now())),
    'carts_today', (select count(*) from shop_events where kind = 'cart' and created_at >= date_trunc('day', now())),
    'orders_today', (select count(*) from orders where created_at >= date_trunc('day', now()) and status <> 'Annulée'),
    'revenue_today', (select coalesce(sum(total_fcfa), 0) from orders where created_at >= date_trunc('day', now()) and status <> 'Annulée'),
    'sources_today', (select coalesce(jsonb_agg(x order by (x->>'visitors')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('channel', coalesce(channel, 'direct'), 'visitors', count(distinct visitor_id)) x
        from shop_events where created_at >= date_trunc('day', now()) group by coalesce(channel, 'direct')) t),
    'feed', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        (select jsonb_build_object('type', e.kind, 'at', e.created_at, 'label', coalesce(p.title, s.name), 'channel', coalesce(e.channel, 'direct'), 'seller', s.name) x
         from shop_events e left join products p on p.id = e.product_id left join sellers s on s.id = e.seller_id
         order by e.created_at desc limit 40)
        union all
        (select jsonb_build_object('type', 'order', 'at', o.created_at, 'label', o.order_number, 'amount', o.total_fcfa, 'city', o.city)
         from orders o order by o.created_at desc limit 15)
      ) t)
  );
end $$;

-- ---------------------------------------------------------------- Support vendeurs et candidatures
create or replace function public.admin_support()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'subject', r.subject, 'message', r.message, 'status', r.status,
        'created_at', r.created_at, 'seller', s.name, 'email', u.email) order by r.created_at desc), '[]'::jsonb)
      from seller_support_requests r left join sellers s on s.owner_id = r.owner_id left join auth.users u on u.id = r.owner_id),
    'applications', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at desc), '[]'::jsonb) from job_applications a)
  );
end $$;

create or replace function public.admin_update_support(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('open', 'answered', 'closed') then raise exception 'Statut inconnu'; end if;
  update seller_support_requests set status = _status where id = _id;
end $$;

-- Droits d'exécution : connectés uniquement (le rôle admin est vérifié dans chaque fonction)
do $$ declare f text; begin
  foreach f in array array['admin_dashboard(int)', 'admin_orders(text,text,int)', 'admin_order_detail(uuid)', 'admin_cancel_order(uuid)',
    'admin_returns(text)', 'admin_update_return(uuid,text,text)', 'admin_sellers()', 'admin_set_seller_active(uuid,boolean)',
    'admin_withdrawals(text)', 'admin_update_withdrawal(uuid,text,text)', 'admin_products(text,text)', 'admin_set_product_published(uuid,boolean)',
    'admin_reports(text)', 'admin_update_report(uuid,text)', 'admin_customers(text)', 'admin_reviews()', 'admin_delete_review(uuid)',
    'admin_live()', 'admin_support()', 'admin_update_support(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- Marketing des vendeurs
create or replace function public.admin_marketing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'kind', c.kind, 'value', c.value, 'is_active', c.is_active,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'seller', s.name,
        'uses', (select count(*) from orders o where o.coupon_code = c.code and o.status <> 'Annulée')) order by c.created_at desc), '[]'::jsonb)
      from seller_coupons c left join sellers s on s.id = c.seller_id),
    'flash', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'value', f.value, 'is_active', f.is_active,
        'starts_at', f.starts_at, 'ends_at', f.ends_at, 'seller', s.name, 'product', p.title) order by f.starts_at desc), '[]'::jsonb)
      from seller_flash_sales f left join products p on p.id = f.product_id left join sellers s on s.id = p.seller_id),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'placement', c.placement, 'status', c.status,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'seller', s.name, 'product', p.title,
        'impressions', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'impression'),
        'clicks', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'click'),
        'purchases', (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'purchase')) order by c.created_at desc), '[]'::jsonb)
      from seller_campaigns c left join sellers s on s.id = c.seller_id left join products p on p.id = c.product_id)
  );
end $$;
revoke all on function public.admin_marketing() from public, anon;
grant execute on function public.admin_marketing() to authenticated;

-- ---------------------------------------------------------------- Catégories : champs gérés depuis l'admin
alter table categories add column if not exists parent_id uuid references categories(id) on delete cascade;
alter table categories add column if not exists commission_pct numeric not null default 10 check (commission_pct between 0 and 100);
alter table categories add column if not exists banner_url text;
alter table categories add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------- Notifications de l'admin (événements réels des 30 derniers jours)
create or replace function public.admin_notifications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select * from (
      (select jsonb_build_object('id', 'o-' || o.id, 'type', 'order', 'section', 'commandes', 'severity', 'info',
         'title', 'Nouvelle commande ' || o.order_number, 'message', coalesce(o.full_name, 'Client') || ' · ' || o.total_fcfa || ' FCFA · ' || coalesce(o.city, ''),
         'created_at', o.created_at) x from orders o where o.created_at > now() - interval '30 days' order by o.created_at desc limit 30)
      union all
      (select jsonb_build_object('id', 'c-' || o.id, 'type', 'cancel', 'section', 'commandes', 'severity', 'warning',
         'title', 'Commande annulée ' || o.order_number, 'message', coalesce(o.full_name, 'Client'), 'created_at', o.updated_at)
       from orders o where o.status = 'Annulée' and o.updated_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'r-' || r.id, 'type', 'return', 'section', 'commandes', 'severity', 'warning',
         'title', 'Demande de retour ' || r.ref, 'message', r.product_title || ' · ' || r.reason, 'created_at', r.created_at)
       from return_requests r where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'w-' || w.id, 'type', 'withdrawal', 'section', 'finance', 'severity', 'warning',
         'title', 'Demande de retrait', 'message', coalesce(s.name, 'Boutique') || ' · ' || w.amount || ' FCFA', 'created_at', w.created_at)
       from seller_withdrawals w left join sellers s on s.id = w.seller_id where w.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'p-' || r.id, 'type', 'report', 'section', 'produits', 'severity', 'danger',
         'title', 'Produit signalé', 'message', coalesce(p.title, '') || ' · ' || r.reason, 'created_at', r.created_at)
       from product_reports r left join products p on p.id = r.product_id where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 's-' || r.id, 'type', 'support', 'section', 'vendeurs', 'severity', 'info',
         'title', 'Message d''un vendeur', 'message', r.subject, 'created_at', r.created_at)
       from seller_support_requests r where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'a-' || a.id, 'type', 'application', 'section', 'clients', 'severity', 'success',
         'title', 'Nouvelle candidature', 'message', a.full_name || ' · ' || a.area, 'created_at', a.created_at)
       from job_applications a where a.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'v-' || s.id, 'type', 'seller', 'section', 'vendeurs', 'severity', 'success',
         'title', 'Nouvelle boutique', 'message', s.name, 'created_at', s.created_at)
       from sellers s where s.created_at > now() - interval '30 days' limit 20)
    ) u limit 80
  ) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_notifications() from public, anon;
grant execute on function public.admin_notifications() to authenticated;

-- ---------------------------------------------------------------- Recherche globale de l'admin
create or replace function public.admin_search(_q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || trim(coalesce(_q, '')) || '%';
begin
  perform public.admin_guard();
  if length(trim(coalesce(_q, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    (select jsonb_build_object('id', 'v-' || s.id, 'type', 'vendeur', 'title', s.name, 'subtitle', coalesce(s.city, ''), 'to', '/vendeurs') x from sellers s where s.name ilike q limit 5)
    union all
    (select jsonb_build_object('id', 'p-' || p.id, 'type', 'produit', 'title', p.title, 'subtitle', p.price_fcfa || ' FCFA', 'to', '/produits') from products p where p.title ilike q limit 6)
    union all
    (select jsonb_build_object('id', 'o-' || o.id, 'type', 'commande', 'title', o.order_number, 'subtitle', coalesce(o.full_name, '') || ' — ' || o.total_fcfa || ' FCFA', 'to', '/commandes')
       from orders o where o.order_number ilike q or coalesce(o.full_name, '') ilike q limit 6)
    union all
    (select jsonb_build_object('id', 'c-' || p.id, 'type', 'client', 'title', coalesce(p.full_name, p.email, 'Client'), 'subtitle', coalesce(p.email, ''), 'to', '/admin/clients/liste')
       from profiles p where coalesce(p.full_name, '') ilike q or coalesce(p.email, '') ilike q or coalesce(p.phone, '') ilike q limit 5)
  ) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_search(text) from public, anon;
grant execute on function public.admin_search(text) to authenticated;
