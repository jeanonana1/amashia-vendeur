-- =====================================================================
-- Amachia : branchement du site vendeur sur la base du site client
-- ---------------------------------------------------------------------
-- Migration ADDITIVE uniquement : aucune table, colonne ou donnée
-- existante n'est supprimée ni modifiée. Le site client continue de
-- fonctionner à l'identique.
--
-- Principe :
--   * seller_profiles  : fiche du vendeur (une ligne par compte vendeur)
--                        -> crée/met à jour automatiquement sa boutique
--                           dans "sellers" (utilisée par le site client).
--   * seller_products  : catalogue de travail du vendeur (brouillons,
--                        variantes, prix d'achat...).
--                        -> tout produit "actif" complet est publié
--                           automatiquement dans "products" (site client).
--   * seller_listings / seller_orders : vues en lecture pour le tableau
--                        de bord vendeur, construites sur products,
--                        orders et order_items.
--   * seller_set_order_status() : seul moyen pour un vendeur de changer
--                        le statut d'un article commandé.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Utilitaires
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Correspondance catégorie vendeur (texte libre) -> catégorie du site client
create or replace function public.seller_category_slug(_category text)
returns text language sql immutable set search_path = public as $$
  select case
    when _category is null then 'home-garden'
    when _category in ('Électronique', 'Téléphones & Tablettes', 'Ordinateurs') then 'electronics'
    when _category in ('Électroménager', 'Cuisine & Ustensiles') then 'kitchen-home'
    when _category in ('Mode', 'Chaussures', 'Bijoux & Accessoires', 'Bébé & Enfants') then 'fashion'
    when _category in ('Beauté') then 'beauty'
    else 'home-garden'
  end
$$;

-- ---------------------------------------------------------------------
-- 1. Fiche vendeur
-- ---------------------------------------------------------------------
create table if not exists public.seller_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null default 'particulier',
  first_name text,
  last_name text,
  phone text,
  category text,
  categories text[] default '{}',
  niu text,
  gender text,
  birth_date date,
  country text,
  city text,
  language text default 'fr',
  payment_method text,
  shop_address text,
  neighborhood text,
  region text,
  share_location boolean default false,
  shop_name text,
  shop_description text,
  shop_email text,
  shop_logo_url text,
  shop_banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_profiles enable row level security;
grant select, insert, update on public.seller_profiles to authenticated;
grant all on public.seller_profiles to service_role;

drop policy if exists "Sellers view own seller profile" on public.seller_profiles;
create policy "Sellers view own seller profile" on public.seller_profiles
  for select to authenticated using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "Sellers create own seller profile" on public.seller_profiles;
create policy "Sellers create own seller profile" on public.seller_profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Sellers update own seller profile" on public.seller_profiles;
create policy "Sellers update own seller profile" on public.seller_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists seller_profiles_updated_at on public.seller_profiles;
create trigger seller_profiles_updated_at before update on public.seller_profiles
  for each row execute function public.touch_updated_at();

-- Une boutique au plus par compte
create unique index if not exists sellers_owner_id_unique on public.sellers(owner_id) where owner_id is not null;

-- Crée ou met à jour la boutique (table sellers) d'un compte vendeur
create or replace function public.ensure_seller_for(_uid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sp public.seller_profiles%rowtype;
  sid uuid;
  shop text;
begin
  if _uid is null then return null; end if;
  select * into sp from public.seller_profiles where id = _uid;
  shop := coalesce(
    nullif(trim(sp.shop_name), ''),
    nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)), ''),
    'Boutique Amachia'
  );

  select id into sid from public.sellers where owner_id = _uid;
  if sid is null then
    insert into public.sellers (owner_id, name, slug, description, logo_url, banner_url, city, is_active)
    values (
      _uid, shop,
      coalesce(nullif(trim(both '-' from regexp_replace(lower(shop), '[^a-z0-9]+', '-', 'g')), ''), 'boutique') || '-' || left(replace(_uid::text, '-', ''), 8),
      sp.shop_description, sp.shop_logo_url, sp.shop_banner_url, sp.city, true
    )
    returning id into sid;
  elsif sp.id is not null then
    update public.sellers set
      name = shop,
      description = sp.shop_description,
      logo_url = sp.shop_logo_url,
      banner_url = sp.shop_banner_url,
      city = sp.city
    where id = sid;
  end if;
  return sid;
end $$;
revoke execute on function public.ensure_seller_for(uuid) from public, anon, authenticated;

create or replace function public.seller_profile_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_seller_for(new.id);
  return new;
end $$;
revoke execute on function public.seller_profile_sync() from public, anon, authenticated;

drop trigger if exists seller_profiles_sync on public.seller_profiles;
create trigger seller_profiles_sync after insert or update on public.seller_profiles
  for each row execute function public.seller_profile_sync();

-- ---------------------------------------------------------------------
-- 2. Catalogue de travail du vendeur
-- ---------------------------------------------------------------------
create table if not exists public.seller_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  description text,
  price numeric not null default 0,
  compare_at_price numeric,
  purchase_price numeric,
  stock integer not null default 0,
  category text,
  sku text,
  status text not null default 'active',
  product_type text default 'simple',
  images text[] default '{}',
  attributes jsonb default '[]'::jsonb,
  specifications jsonb default '[]'::jsonb,
  variant_images jsonb default '[]'::jsonb,
  bundle_items jsonb default '[]'::jsonb,
  virtual_files jsonb default '[]'::jsonb,
  marketing_angles jsonb default '[]'::jsonb,
  marketplace_product_id uuid unique references public.products(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_products_user_id_idx on public.seller_products(user_id);

alter table public.seller_products enable row level security;
grant select, insert, update, delete on public.seller_products to authenticated;
grant all on public.seller_products to service_role;

drop policy if exists "Sellers view own seller products" on public.seller_products;
create policy "Sellers view own seller products" on public.seller_products
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "Sellers insert own seller products" on public.seller_products;
create policy "Sellers insert own seller products" on public.seller_products
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Sellers update own seller products" on public.seller_products;
create policy "Sellers update own seller products" on public.seller_products
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Sellers delete own seller products" on public.seller_products;
create policy "Sellers delete own seller products" on public.seller_products
  for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists seller_products_updated_at on public.seller_products;
create trigger seller_products_updated_at before update on public.seller_products
  for each row execute function public.touch_updated_at();

-- Publication automatique vers le catalogue du site client
create or replace function public.seller_product_publish()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  publishable boolean;
  specs_obj jsonb;
begin
  -- évite la boucle avec la synchronisation de stock inverse
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

  if new.marketplace_product_id is null then
    insert into public.products (
      seller_id, category_slug, title, description, price_fcfa, original_price_fcfa,
      stock, images, specs, features, is_published
    ) values (
      sid, public.seller_category_slug(new.category), new.name, new.description,
      round(new.price)::int,
      case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      greatest(new.stock, 0), to_jsonb(coalesce(new.images, '{}')), specs_obj, '[]'::jsonb, true
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
      is_published = publishable
    where id = new.marketplace_product_id;
    if publishable and new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.seller_product_publish() from public, anon, authenticated;

drop trigger if exists seller_products_publish on public.seller_products;
create trigger seller_products_publish before insert or update on public.seller_products
  for each row execute function public.seller_product_publish();

-- Suppression côté vendeur : le produit est retiré de la vente (pas supprimé,
-- car d'anciennes commandes y font référence)
create or replace function public.seller_product_unpublish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.marketplace_product_id is not null then
    update public.products set is_published = false where id = old.marketplace_product_id;
  end if;
  return old;
end $$;
revoke execute on function public.seller_product_unpublish() from public, anon, authenticated;

drop trigger if exists seller_products_unpublish on public.seller_products;
create trigger seller_products_unpublish after delete on public.seller_products
  for each row execute function public.seller_product_unpublish();

-- Stock : quand une commande client fait baisser le stock, le vendeur le voit
create or replace function public.products_stock_to_seller()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.stock is distinct from old.stock then
    update public.seller_products set stock = new.stock
    where marketplace_product_id = new.id and stock is distinct from new.stock;
  end if;
  return new;
end $$;
revoke execute on function public.products_stock_to_seller() from public, anon, authenticated;

drop trigger if exists products_stock_to_seller on public.products;
create trigger products_stock_to_seller after update of stock on public.products
  for each row execute function public.products_stock_to_seller();

-- ---------------------------------------------------------------------
-- 3. Commandes vues par le vendeur
-- ---------------------------------------------------------------------
alter table public.order_items
  add column if not exists seller_status text not null default 'pending';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_seller_status_check') then
    alter table public.order_items add constraint order_items_seller_status_check
      check (seller_status in ('pending', 'preparing', 'shipped', 'delivered', 'cancelled'));
  end if;
end $$;

-- Boutiques appartenant à l'utilisateur connecté (évite la récursion RLS)
create or replace function public.my_seller_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.sellers where owner_id = auth.uid()
$$;
revoke execute on function public.my_seller_ids() from public, anon;
grant execute on function public.my_seller_ids() to authenticated;

create or replace function public.is_order_seller(_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items oi
    join public.sellers s on s.id = oi.seller_id
    where oi.order_id = _order_id and s.owner_id = auth.uid()
  )
$$;
revoke execute on function public.is_order_seller(uuid) from public, anon;
grant execute on function public.is_order_seller(uuid) to authenticated;

drop policy if exists "Sellers view own order items" on public.order_items;
create policy "Sellers view own order items" on public.order_items
  for select to authenticated using (seller_id in (select public.my_seller_ids()));

drop policy if exists "Sellers view orders containing their items" on public.orders;
create policy "Sellers view orders containing their items" on public.orders
  for select to authenticated using (public.is_order_seller(id));

-- Vue : fiches publiées du vendeur connecté
create or replace view public.seller_listings with (security_invoker = true) as
select
  p.id,
  sp.id as product_id,
  sp.user_id as seller_id,
  p.title,
  p.price_fcfa as price,
  case when p.is_published then 'published' else 'paused' end as status,
  coalesce(sp.published_at, p.created_at) as published_at,
  coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p.images) = 'array' then p.images else '[]'::jsonb end)), '{}') as images
from public.seller_products sp
join public.products p on p.id = sp.marketplace_product_id
where sp.user_id = auth.uid();
grant select on public.seller_listings to authenticated;

-- Vue : articles commandés chez le vendeur connecté
create or replace view public.seller_orders with (security_invoker = true) as
select
  oi.id,
  o.order_number,
  oi.product_id as listing_id,
  sp.id as product_id,
  s.owner_id as seller_id,
  coalesce(nullif(trim(o.full_name), ''), 'Client Amachia') as customer_name,
  concat_ws(', ', nullif(o.district, ''), nullif(o.city, '')) as delivery_area,
  oi.product_title,
  oi.quantity,
  oi.unit_price_fcfa as unit_price,
  (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount,
  coalesce(o.payment_method, 'À la livraison') as payment_method,
  false as paid,
  case when o.status = 'Annulée' then 'cancelled' else oi.seller_status end as status,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
join public.sellers s on s.id = oi.seller_id
left join public.seller_products sp on sp.marketplace_product_id = oi.product_id
where s.owner_id = auth.uid();
grant select on public.seller_orders to authenticated;

-- Changement de statut par le vendeur (uniquement ses articles)
create or replace function public.seller_set_order_status(_item_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _status not in ('pending', 'preparing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Statut invalide';
  end if;
  update public.order_items set seller_status = _status
  where id = _item_id and seller_id in (select id from public.sellers where owner_id = auth.uid());
  if not found then raise exception 'Commande introuvable ou non autorisée'; end if;
end $$;
revoke execute on function public.seller_set_order_status(uuid, text) from public, anon;
grant execute on function public.seller_set_order_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Documents du vendeur et signalements
-- ---------------------------------------------------------------------
create table if not exists public.seller_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);
alter table public.seller_documents enable row level security;
grant select, insert, update, delete on public.seller_documents to authenticated;
grant all on public.seller_documents to service_role;
drop policy if exists "Sellers view own docs" on public.seller_documents;
create policy "Sellers view own docs" on public.seller_documents
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "Sellers insert own docs" on public.seller_documents;
create policy "Sellers insert own docs" on public.seller_documents
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Sellers update own docs" on public.seller_documents;
create policy "Sellers update own docs" on public.seller_documents
  for update to authenticated using (auth.uid() = user_id);
drop policy if exists "Sellers delete own docs" on public.seller_documents;
create policy "Sellers delete own docs" on public.seller_documents
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.seller_product_owner(_product_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.seller_products where id = _product_id
$$;
grant execute on function public.seller_product_owner(uuid) to authenticated;

create table if not exists public.product_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.seller_products(id) on delete cascade,
  seller_id uuid not null,
  reporter_id uuid,
  reporter_name text,
  reporter_contact text,
  reason text not null,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_reports enable row level security;
grant select, insert, update, delete on public.product_reports to authenticated;
grant all on public.product_reports to service_role;
drop policy if exists "Sellers view reports on own products" on public.product_reports;
create policy "Sellers view reports on own products" on public.product_reports
  for select to authenticated using (auth.uid() = seller_id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "Sellers update reports on own products" on public.product_reports;
create policy "Sellers update reports on own products" on public.product_reports
  for update to authenticated using (auth.uid() = seller_id);
drop policy if exists "Sellers delete reports on own products" on public.product_reports;
create policy "Sellers delete reports on own products" on public.product_reports
  for delete to authenticated using (auth.uid() = seller_id);
drop policy if exists "Authenticated users can report products" on public.product_reports;
create policy "Authenticated users can report products" on public.product_reports
  for insert to authenticated with check (
    auth.uid() = reporter_id
    and seller_id = public.seller_product_owner(product_id)
  );
drop trigger if exists product_reports_updated_at on public.product_reports;
create trigger product_reports_updated_at before update on public.product_reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Stockage des fichiers
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('seller-documents', 'seller-documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

drop policy if exists "Sellers read own docs" on storage.objects;
create policy "Sellers read own docs" on storage.objects for select to authenticated
  using (bucket_id = 'seller-documents' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Sellers upload own docs" on storage.objects;
create policy "Sellers upload own docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-documents' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Sellers update own docs" on storage.objects;
create policy "Sellers update own docs" on storage.objects for update to authenticated
  using (bucket_id = 'seller-documents' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Sellers delete own docs" on storage.objects;
create policy "Sellers delete own docs" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Anyone view product images" on storage.objects;
create policy "Anyone view product images" on storage.objects for select
  using (bucket_id = 'product-images');
drop policy if exists "Sellers upload own product images" on storage.objects;
create policy "Sellers upload own product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Sellers update own product images" on storage.objects;
create policy "Sellers update own product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Sellers delete own product images" on storage.objects;
create policy "Sellers delete own product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);

commit;
