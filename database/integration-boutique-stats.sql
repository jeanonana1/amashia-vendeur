-- =====================================================================
-- Amashia : attributs, boutiques publiques, abonnés, visites, statistiques
-- Migration ADDITIVE : rien n'est supprimé.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Tous les attributs du vendeur visibles sur le site client
--    products.attributes = attributs hors couleur [{name, values}]
--    (les choix du client sont envoyés avec la commande dans « size »)
-- ---------------------------------------------------------------------
alter table public.products add column if not exists attributes jsonb not null default '[]'::jsonb;

create or replace function public.seller_other_attributes(_attrs jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', trim(a->>'name'), 'values', a->'values')), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(_attrs) = 'array' then _attrs else '[]'::jsonb end) a
  where coalesce(trim(a->>'name'), '') <> ''
    and lower(translate(trim(a->>'name'), 'éèêÉÈÊ', 'eeeeee')) not in ('couleur', 'couleurs', 'color', 'colour', 'colors')
    and jsonb_typeof(a->'values') = 'array' and jsonb_array_length(a->'values') > 0
$$;

create or replace function public.seller_product_publish()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  publishable boolean;
  specs_obj jsonb;
  v_groups jsonb;
  v_colors jsonb;
  v_attrs jsonb;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  publishable := new.status = 'active'
    and coalesce(trim(new.name), '') <> ''
    and coalesce(new.price, 0) > 0
    and coalesce(array_length(new.images, 1), 0) > 0;

  if new.marketplace_product_id is null and not publishable then
    return new;
  end if;

  sid := public.ensure_seller_for(new.user_id);

  select coalesce(jsonb_object_agg(s->>'name', coalesce(s->>'value', '')), '{}'::jsonb)
    into specs_obj
  from jsonb_array_elements(case when jsonb_typeof(new.specifications) = 'array' then new.specifications else '[]'::jsonb end) s
  where coalesce(trim(s->>'name'), '') <> '';

  v_groups := public.seller_variant_groups(new.variant_images);
  select coalesce(jsonb_agg(distinct c), '[]'::jsonb) into v_colors
  from (
    select jsonb_array_elements_text(public.seller_attribute_values(new.attributes, array['couleur', 'couleurs', 'color', 'colour', 'colors'])) c
    union
    select g->>'label' from jsonb_array_elements(v_groups) g
  ) x;
  v_attrs := public.seller_other_attributes(new.attributes);

  if new.marketplace_product_id is null then
    insert into public.products (
      seller_id, category_slug, title, description, price_fcfa, original_price_fcfa,
      stock, images, specs, features, colors, sizes, variant_images, attributes, is_published
    ) values (
      sid, public.seller_category_slug(new.category), new.name, new.description,
      round(new.price)::int,
      case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      greatest(new.stock, 0), to_jsonb(coalesce(new.images, '{}')), specs_obj, '[]'::jsonb,
      v_colors, '[]'::jsonb, v_groups, v_attrs, true
    )
    returning id into new.marketplace_product_id;
    new.published_at := now();
  else
    update public.products set
      seller_id = sid,
      category_slug = public.seller_category_slug(new.category),
      title = case when coalesce(trim(new.name), '') <> '' then new.name else title end,
      description = new.description,
      price_fcfa = case when coalesce(new.price, 0) > 0 then round(new.price)::int else price_fcfa end,
      original_price_fcfa = case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      stock = greatest(new.stock, 0),
      images = case when coalesce(array_length(new.images, 1), 0) > 0 then to_jsonb(new.images) else images end,
      specs = specs_obj,
      colors = v_colors,
      sizes = '[]'::jsonb,
      variant_images = v_groups,
      attributes = v_attrs,
      is_published = publishable
    where id = new.marketplace_product_id;
    if publishable and new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.seller_product_publish() from public, anon, authenticated;

-- Commandes vues par le vendeur : couleur et options choisies par le client
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
  oi.size as options
from public.order_items oi
join public.orders o on o.id = oi.order_id
join public.sellers s on s.id = oi.seller_id
left join public.seller_products sp on sp.marketplace_product_id = oi.product_id
where s.owner_id = auth.uid();
grant select on public.seller_orders to authenticated;

-- ---------------------------------------------------------------------
-- 2. Abonnés des boutiques
-- ---------------------------------------------------------------------
create table if not exists public.seller_followers (
  seller_id uuid not null references public.sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seller_id, user_id)
);
alter table public.seller_followers enable row level security;
grant select, insert, delete on public.seller_followers to authenticated;
drop policy if exists "Users see own follows" on public.seller_followers;
create policy "Users see own follows" on public.seller_followers for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users follow shops" on public.seller_followers;
create policy "Users follow shops" on public.seller_followers for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users unfollow shops" on public.seller_followers;
create policy "Users unfollow shops" on public.seller_followers for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. Visites des boutiques et produits (anonymes)
-- ---------------------------------------------------------------------
create table if not exists public.shop_events (
  id bigserial primary key,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  visitor_id text not null,
  kind text not null check (kind in ('shop', 'product', 'cart')),
  created_at timestamptz not null default now()
);
create index if not exists shop_events_seller_time_idx on public.shop_events(seller_id, created_at desc);
create index if not exists shop_events_dedupe_idx on public.shop_events(visitor_id, kind, seller_id, created_at desc);
alter table public.shop_events enable row level security; -- aucun accès direct : uniquement via les fonctions
revoke all on public.shop_events from anon, authenticated;
revoke all on sequence public.shop_events_id_seq from anon, authenticated;

-- Enregistre une visite (boutique, fiche produit, ajout au panier).
-- Une même personne n'est comptée qu'une fois par élément et par 30 minutes.
create or replace function public.track_shop_event(_kind text, _product uuid, _seller_slug text, _visitor text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid; pid uuid := _product;
begin
  if _kind not in ('shop', 'product', 'cart') or coalesce(length(_visitor), 0) not between 8 and 64 then return; end if;
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
  insert into shop_events (seller_id, product_id, visitor_id, kind) values (sid, pid, _visitor, _kind);
end $$;
revoke execute on function public.track_shop_event(text, uuid, text, text) from public;
grant execute on function public.track_shop_event(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Fiche publique d'une boutique (site client) — uniquement des vraies données
-- ---------------------------------------------------------------------
create or replace function public.public_seller(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'slug', s.slug, 'description', s.description,
    'logo_url', s.logo_url, 'banner_url', s.banner_url, 'city', s.city, 'created_at', s.created_at,
    'products', (select count(*) from products p where p.seller_id = s.id and p.is_published),
    'followers', (select count(*) from seller_followers f where f.seller_id = s.id),
    'reviews', (select count(*) from reviews r join products p on p.id = r.product_id where p.seller_id = s.id),
    'rating', (select round(avg(r.rating)::numeric, 1) from reviews r join products p on p.id = r.product_id where p.seller_id = s.id),
    'sales', (select coalesce(sum(oi.quantity), 0) from order_items oi join orders o on o.id = oi.order_id
              where oi.seller_id = s.id and o.status <> 'Annulée' and oi.seller_status <> 'cancelled')
  )
  from sellers s where s.slug = _slug and s.is_active
$$;
grant execute on function public.public_seller(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Statistiques du tableau de bord vendeur (vendeur connecté uniquement)
--    _days : 7, 30 ou 365
-- ---------------------------------------------------------------------
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
    'balance', (select coalesce(sum(amount), 0) from valid where seller_status = 'delivered'),
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

-- Remet à jour les produits vendeurs déjà publiés (attributs)
update public.seller_products set updated_at = now() where marketplace_product_id is not null;

commit;
