-- =====================================================================
-- Amashia : retraits vendeurs, signalements, clients, avis, analytique
-- Migration ADDITIVE (deux contraintes NOT NULL assouplies sur
-- product_reports pour accepter les signalements du site client).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Photo du produit dans les commandes vues par le vendeur
-- ---------------------------------------------------------------------
create or replace view public.seller_orders with (security_invoker = true) as
select
  oi.id,
  o.order_number,
  oi.product_id as listing_id,
  sp.id as product_id,
  s.owner_id as seller_id,
  coalesce(nullif(trim(o.full_name), ''), 'Client Amashia') as customer_name,
  concat_ws(', ', nullif(o.district, ''), nullif(o.city, '')) as delivery_area,
  oi.product_title,
  oi.quantity,
  oi.unit_price_fcfa as unit_price,
  (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount,
  coalesce(o.payment_method, 'À la livraison') as payment_method,
  false as paid,
  case when o.status = 'Annulée' then 'cancelled' else oi.seller_status end as status,
  oi.created_at,
  oi.color,
  oi.size as options,
  (select p.images->>0 from public.products p where p.id = oi.product_id) as product_image,
  o.id as order_id
from public.order_items oi
join public.orders o on o.id = oi.order_id
join public.sellers s on s.id = oi.seller_id
left join public.seller_products sp on sp.marketplace_product_id = oi.product_id
where s.owner_id = auth.uid();
grant select on public.seller_orders to authenticated;

-- ---------------------------------------------------------------------
-- 2. Moyens de retrait et demandes de retrait
-- ---------------------------------------------------------------------
create table if not exists public.seller_payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('orange_money', 'mtn_momo', 'bank')),
  label text,
  account_name text not null,
  account_number text not null,
  bank_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.seller_payout_methods enable row level security;
grant select, insert, update, delete on public.seller_payout_methods to authenticated;
drop policy if exists "Sellers manage own payout methods" on public.seller_payout_methods;
create policy "Sellers manage own payout methods" on public.seller_payout_methods for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.seller_withdrawals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  method jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.seller_withdrawals enable row level security;
grant select on public.seller_withdrawals to authenticated;
drop policy if exists "Sellers see own withdrawals" on public.seller_withdrawals;
create policy "Sellers see own withdrawals" on public.seller_withdrawals for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- Solde disponible = ventes livrées - retraits demandés ou payés
create or replace function public.seller_available_balance(_seller uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(oi.unit_price_fcfa * coalesce(oi.quantity, 1))
              from order_items oi join orders o on o.id = oi.order_id
              where oi.seller_id = _seller and oi.seller_status = 'delivered' and o.status <> 'Annulée'), 0)
    - coalesce((select sum(amount) from seller_withdrawals where seller_id = _seller and status in ('pending', 'paid')), 0)
  )::int
$$;
revoke execute on function public.seller_available_balance(uuid) from public, anon, authenticated;

create or replace function public.request_withdrawal(_amount integer, _method uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid; m record; wid uuid;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then raise exception 'Boutique introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text, 1));
  if _amount is null or _amount < 1000 then raise exception 'Montant minimum : 1 000 FCFA'; end if;
  select * into m from seller_payout_methods where id = _method and user_id = auth.uid();
  if m.id is null then raise exception 'Moyen de retrait introuvable'; end if;
  if _amount > public.seller_available_balance(sid) then raise exception 'Solde insuffisant'; end if;
  insert into seller_withdrawals (seller_id, user_id, amount, method)
  values (sid, auth.uid(), _amount, jsonb_build_object('kind', m.kind, 'label', m.label, 'account_name', m.account_name, 'account_number', m.account_number, 'bank_name', m.bank_name))
  returning id into wid;
  return wid;
end $$;
revoke execute on function public.request_withdrawal(integer, uuid) from public, anon;
grant execute on function public.request_withdrawal(integer, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Signalements envoyés depuis le site client
-- ---------------------------------------------------------------------
alter table public.product_reports alter column product_id drop not null;
alter table public.product_reports alter column seller_id drop not null;
alter table public.product_reports add column if not exists listing_id uuid references public.products(id) on delete set null;

create or replace function public.report_product(_product uuid, _reason text, _message text, _name text, _contact text)
returns void language plpgsql security definer set search_path = public as $$
declare sp record; owner uuid;
begin
  if coalesce(trim(_reason), '') = '' then raise exception 'Motif requis'; end if;
  if not exists (select 1 from products where id = _product) then raise exception 'Produit introuvable'; end if;
  -- limite : 5 signalements par produit et par personne connectée et par jour
  if auth.uid() is not null and (select count(*) from product_reports where reporter_id = auth.uid() and listing_id = _product and created_at > now() - interval '1 day') >= 5 then
    return;
  end if;
  select id, user_id into sp from seller_products where marketplace_product_id = _product;
  select s.owner_id into owner from products p join sellers s on s.id = p.seller_id where p.id = _product;
  insert into product_reports (product_id, listing_id, seller_id, reporter_id, reporter_name, reporter_contact, reason, message)
  values (sp.id, _product, coalesce(sp.user_id, owner), auth.uid(), left(nullif(trim(_name), ''), 80), left(nullif(trim(_contact), ''), 120), left(trim(_reason), 120), left(nullif(trim(_message), ''), 1000));
end $$;
revoke execute on function public.report_product(uuid, text, text, text, text) from public;
grant execute on function public.report_product(uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Clients et avis du vendeur (sans téléphone ni e-mail des clients)
-- ---------------------------------------------------------------------
create or replace function public.seller_customers()
returns jsonb language sql stable security definer set search_path = public as $$
  with sid as (select id from sellers where owner_id = auth.uid()),
  lines as (
    select o.user_id, o.full_name, o.city, o.district, o.created_at, o.id as order_id,
           oi.quantity, (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount, oi.product_title,
           (o.status <> 'Annulée' and oi.seller_status <> 'cancelled') as valid
    from order_items oi join orders o on o.id = oi.order_id
    where oi.seller_id = (select id from sid)
  )
  select coalesce(jsonb_agg(c order by (c->>'last_order') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', md5(user_id::text),
      'name', (array_agg(coalesce(nullif(trim(full_name), ''), 'Client Amashia') order by created_at desc))[1],
      'area', (array_agg(concat_ws(', ', nullif(district, ''), nullif(city, '')) order by created_at desc))[1],
      'orders', count(distinct order_id) filter (where valid),
      'items', coalesce(sum(quantity) filter (where valid), 0),
      'spent', coalesce(sum(amount) filter (where valid), 0),
      'first_order', min(created_at),
      'last_order', max(created_at),
      'products', (array_agg(distinct product_title))[1:5]
    ) c
    from lines group by user_id
  ) x
$$;
revoke execute on function public.seller_customers() from public, anon;
grant execute on function public.seller_customers() to authenticated;

create or replace function public.seller_reviews()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment, 'author', coalesce(nullif(trim(r.author_name), ''), 'Client Amashia'),
    'photos', r.photos, 'verified', r.is_verified_purchase, 'created_at', r.created_at,
    'product_id', p.id, 'product_title', p.title, 'product_image', p.images->>0
  ) order by r.created_at desc), '[]'::jsonb)
  from reviews r join products p on p.id = r.product_id
  where p.seller_id = (select id from sellers where owner_id = auth.uid())
$$;
revoke execute on function public.seller_reviews() from public, anon;
grant execute on function public.seller_reviews() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Origine des visites (analytique)
-- ---------------------------------------------------------------------
alter table public.shop_events add column if not exists source text;
drop function if exists public.track_shop_event(text, uuid, text, text);
create or replace function public.track_shop_event(_kind text, _product uuid, _seller_slug text, _visitor text, _source text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid; pid uuid := _product; src text;
begin
  if _kind not in ('shop', 'product', 'cart') or coalesce(length(_visitor), 0) not between 8 and 64 then return; end if;
  src := case when _source in ('search', 'category', 'home', 'shop', 'product', 'external', 'direct', 'other') then _source else 'other' end;
  if pid is not null then
    select seller_id into sid from products where id = pid and is_published;
  elsif _seller_slug is not null then
    select id into sid from sellers where slug = _seller_slug and is_active;
  end if;
  if sid is null then return; end if;
  if exists (
    select 1 from shop_events
    where visitor_id = _visitor and kind = _kind and seller_id = sid
      and product_id is not distinct from pid and created_at > now() - interval '30 minutes'
  ) then return; end if;
  insert into shop_events (seller_id, product_id, visitor_id, kind, source) values (sid, pid, _visitor, _kind, src);
end $$;
revoke execute on function public.track_shop_event(text, uuid, text, text, text) from public;
grant execute on function public.track_shop_event(text, uuid, text, text, text) to anon, authenticated;

-- Analytique détaillée sur une période libre, par jour / semaine / mois
create or replace function public.seller_analytics(_from date, _to date, _grain text default 'day')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sid uuid;
  g text := case when _grain in ('day', 'week', 'month') then _grain else 'day' end;
  f timestamptz := coalesce(_from, current_date - 29)::timestamptz;
  t timestamptz := (coalesce(_to, current_date) + 1)::timestamptz;
  res jsonb;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then return null; end if;
  if t - f > interval '800 days' then f := t - interval '800 days'; end if;
  with valid as (
    select oi.*, o.user_id, (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount, p.category_slug, p.images->>0 as image
    from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
    where oi.seller_id = sid and o.status <> 'Annulée' and oi.seller_status <> 'cancelled'
      and oi.created_at >= f and oi.created_at < t
  ),
  ev as (select * from shop_events where seller_id = sid and created_at >= f and created_at < t),
  buckets as (select generate_series(date_trunc(g, f), date_trunc(g, t - interval '1 second'), ('1 ' || g)::interval) b)
  select jsonb_build_object(
    'from', f, 'to', t, 'grain', g,
    'revenue', (select coalesce(sum(amount), 0) from valid),
    'orders', (select count(distinct order_id) from valid),
    'items', (select coalesce(sum(quantity), 0) from valid),
    'customers', (select count(distinct user_id) from valid),
    'avg_order', (select coalesce(round(sum(amount)::numeric / nullif(count(distinct order_id), 0)), 0) from valid),
    'visits', (select count(*) from ev where kind in ('shop', 'product')),
    'visitors', (select count(distinct visitor_id) from ev),
    'cart_adds', (select count(*) from ev where kind = 'cart'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'revenue', (select coalesce(sum(amount), 0) from valid where date_trunc(g, created_at) = b),
        'orders', (select count(distinct order_id) from valid where date_trunc(g, created_at) = b),
        'visits', (select count(*) from ev where kind in ('shop', 'product') and date_trunc(g, created_at) = b)
      ) order by b), '[]'::jsonb) from buckets),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', s, 'visits', n) order by n desc), '[]'::jsonb)
                from (select coalesce(source, 'other') s, count(*) n from ev where kind in ('shop', 'product') group by 1) x),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', c, 'revenue', r, 'items', q) order by r desc), '[]'::jsonb)
                   from (select coalesce(category_slug, 'autre') c, sum(amount) r, sum(quantity) q from valid group by 1) x),
    'top_products', (select coalesce(jsonb_agg(x order by (x->>'revenue')::numeric desc, (x->>'views')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'title', p.title, 'image', p.images->>0,
          'views', (select count(*) from ev where kind = 'product' and product_id = p.id),
          'carts', (select count(*) from ev where kind = 'cart' and product_id = p.id),
          'items', (select coalesce(sum(quantity), 0) from valid where product_id = p.id),
          'revenue', (select coalesce(sum(amount), 0) from valid where product_id = p.id)
        ) x
        from products p where p.seller_id = sid and p.is_published
      ) y)
  ) into res;
  return res;
end $$;
revoke execute on function public.seller_analytics(date, date, text) from public, anon;
grant execute on function public.seller_analytics(date, date, text) to authenticated;

-- Statistiques : le solde tient compte des retraits
create or replace function public.seller_dashboard_stats(_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
    select oi.*, o.user_id, o.status as order_status, (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount
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
    'pending_balance', (select coalesce(sum(amount), 0) from valid where seller_status in ('pending', 'preparing', 'shipped')),
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
end $$;
revoke execute on function public.seller_dashboard_stats(int) from public, anon;
grant execute on function public.seller_dashboard_stats(int) to authenticated;

commit;
