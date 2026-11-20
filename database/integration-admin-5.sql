-- Amachia — Admin, étape 5 : catégories, sous-catégories, marques et attributs gérés depuis l'admin
-- et utilisés par le site client (bannières, cercles de sous-catégories) et l'espace vendeur (formulaire produit).
-- Additif : les listes actuelles des deux sites sont reprises telles quelles au départ.

-- 1. Catégories : description + image (= bannière de la catégorie sur le site client)
alter table public.categories add column if not exists description text;

-- 2. Sous-catégories
alter table public.subcategories add column if not exists description text;
alter table public.subcategories add column if not exists is_active boolean not null default true;
alter table public.subcategories add column if not exists created_at timestamptz not null default now();
create unique index if not exists subcategories_slug_uq on public.subcategories (slug);
alter table public.subcategories enable row level security;
drop policy if exists "Lecture publique des sous-catégories" on public.subcategories;
create policy "Lecture publique des sous-catégories" on public.subcategories for select using (true);
drop policy if exists "Lecture publique des catégories" on public.categories;
create policy "Lecture publique des catégories" on public.categories for select using (true);

-- Reprise des sous-catégories existantes (site client + formulaire vendeur), dans l'ordre d'affichage
do $$
declare cat text; names text[]; i int; cid uuid;
begin
  for cat, names in select * from (values
    ('electronics', array['Téléphones & Tablettes','Ordinateurs & Accessoires','TV & Home Cinéma','Audio & Hi-Fi','Photo & Caméscopes','Jeux vidéo & Consoles','Drones','Objets connectés','Accessoires téléphone','Stockage & Batteries','Ordinateurs','Électronique']),
    ('fashion', array['Vêtements Homme','Vêtements Femme','Chaussures Homme','Chaussures Femme','Sacs & Bagages','Montres','Bijoux','Lunettes de soleil','Chaussures','Bijoux & Accessoires','Bébé & Enfants','Mode']),
    ('home-garden', array['Électroménager','Cuisine & Maison','Meubles','Décoration','Literie','Jardin & Extérieur','Maison & Décoration','Alimentation','Sport & Loisirs','Automobile & Moto','Agriculture & Élevage','Services']),
    ('beauty', array['Maquillage','Soins du visage','Soins du corps','Parfums','Cheveux','Hygiène','Manucure','Bien-être','Beauté']),
    ('kitchen-home', array['Petit électroménager','Ustensiles de cuisine','Vaisselle','Rangement','Linge de maison','Éclairage','Salle de bain','Cuisine & Ustensiles'])
  ) v(c, n) loop
    select id into cid from public.categories where slug = cat;
    if cid is null then continue; end if;
    for i in 1 .. array_length(names, 1) loop
      insert into public.subcategories (category_id, slug, name, sort_order)
      values (cid, public.seller_subcategory_slug(names[i]), names[i], i)
      on conflict (slug) do nothing;
    end loop;
  end loop;
end $$;

-- La catégorie et la sous-catégorie publiées suivent désormais la liste gérée par l'admin
create or replace function public.seller_subcategory_slug(_category text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select s.slug from public.subcategories s where lower(s.name) = lower(btrim(coalesce(_category, ''))) limit 1),
    nullif(trim(both '-' from regexp_replace(
      lower(translate(coalesce(_category, ''), 'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
      '[^a-z0-9]+', '-', 'g')), ''))
$$;
create or replace function public.seller_category_slug(_category text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select c.slug from public.subcategories s join public.categories c on c.id = s.category_id
      where lower(s.name) = lower(btrim(coalesce(_category, ''))) limit 1),
    (select c.slug from public.categories c where lower(c.name) = lower(btrim(coalesce(_category, ''))) limit 1),
    case
      when _category is null then 'home-garden'
      when _category in ('Électronique', 'Téléphones & Tablettes', 'Ordinateurs') then 'electronics'
      when _category in ('Électroménager', 'Cuisine & Ustensiles') then 'kitchen-home'
      when _category in ('Mode', 'Chaussures', 'Bijoux & Accessoires', 'Bébé & Enfants') then 'fashion'
      when _category in ('Beauté') then 'beauty'
      else 'home-garden'
    end)
$$;

-- 3. Marques
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists brands_name_uq on public.brands (lower(name));
alter table public.brands enable row level security;
drop policy if exists "Lecture publique des marques" on public.brands;
create policy "Lecture publique des marques" on public.brands for select using (true);
insert into public.brands (name)
select distinct btrim(b) from (
  select brand b from public.products where coalesce(btrim(brand), '') <> ''
  union all select unnest(array['Samsung','Apple','Xiaomi','HP','Sony','Bose','JBL','Canon','DJI','Logitech','Anker','Oraimo',
    'Nike','Adidas','Zara','H&M','Gucci','Puma','New Balance','Levi''s','Binatone','Nexus','Hisense','LG','Philips','Moulinex',
    'L''Oréal','Nivea','Maybelline','Garnier','Neutrogena','Dove','Chanel','Dior','Tefal','Bosch','Tecno','Infinix','itel'])
) x on conflict do nothing;

-- 4. Attributs de produit (proposés aux vendeurs)
create table if not exists public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'text' check (kind in ('text', 'color', 'size')),
  values text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists product_attributes_name_uq on public.product_attributes (lower(name));
alter table public.product_attributes enable row level security;
drop policy if exists "Lecture publique des attributs" on public.product_attributes;
create policy "Lecture publique des attributs" on public.product_attributes for select using (true);
insert into public.product_attributes (name, kind, values, sort_order) values
  ('Taille', 'size', array['XS','S','M','L','XL','XXL','3XL'], 1),
  ('Pointure', 'size', array['36','37','38','39','40','41','42','43','44','45','46'], 2),
  ('Couleur', 'color', '{}', 3),
  ('Matière', 'text', array['Coton','Polyester','Cuir','Soie','Laine','Lin','Jean','Nylon','Velours'], 4),
  ('Style', 'text', array['Casual','Sport','Élégant','Vintage','Moderne'], 5),
  ('Capacité', 'text', array['32 Go','64 Go','128 Go','256 Go','512 Go','1 To','2 To'], 6),
  ('Mémoire RAM', 'text', array['2 Go','4 Go','6 Go','8 Go','12 Go','16 Go','32 Go'], 7),
  ('Poids', 'text', '{}', 8),
  ('Volume', 'text', '{}', 9),
  ('Genre', 'text', array['Homme','Femme','Unisexe','Enfant'], 10)
on conflict do nothing;

-- 5. Lecture publique de toute la classification (site client + espace vendeur)
create or replace function public.catalog_taxonomy() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'image_url', c.image_url, 'sort_order', c.sort_order,
        'subcategories', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'image_url', s.image_url) order by s.sort_order, s.name)
                                   from public.subcategories s where s.category_id = c.id and s.is_active), '[]'::jsonb))
      order by c.sort_order, c.name) from public.categories c where c.parent_id is null), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'logo_url', b.logo_url) order by lower(b.name)) from public.brands b where b.is_active), '[]'::jsonb),
    'attributes', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'kind', a.kind, 'values', to_jsonb(a.values)) order by a.sort_order, a.name) from public.product_attributes a where a.is_active), '[]'::jsonb))
$$;
grant execute on function public.catalog_taxonomy() to anon, authenticated;

-- 6. Gestion par l'admin -------------------------------------------------------------------------
create or replace function public.admin_taxonomy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'image_url', c.image_url, 'sort_order', c.sort_order,
        'commission_pct', c.commission_pct,
        'active_products', (select count(*) from products p where p.category_slug = c.slug and p.is_published),
        'total_products', (select count(*) from products p where p.category_slug = c.slug),
        'subcategories', (select count(*) from subcategories s where s.category_id = c.id))
      order by c.sort_order, c.name) from categories c where c.parent_id is null), '[]'::jsonb),
    'subcategories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'image_url', s.image_url, 'is_active', s.is_active,
        'sort_order', s.sort_order, 'category_id', s.category_id, 'category', c.name,
        'active_products', (select count(*) from products p where p.subcategory_slug = s.slug and p.is_published))
      order by c.sort_order, s.sort_order, s.name) from subcategories s join categories c on c.id = s.category_id), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url, 'is_active', b.is_active, 'created_at', b.created_at,
        'products', (select count(*) from products p where lower(btrim(p.brand)) = lower(b.name) and p.is_published))
      order by lower(b.name)) from brands b), '[]'::jsonb),
    'attributes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'values', to_jsonb(a.values), 'is_active', a.is_active, 'sort_order', a.sort_order,
        'products', (select count(*) from products p where p.is_published and exists (select 1 from jsonb_array_elements(coalesce(p.attributes, '[]'::jsonb)) e where lower(e->>'name') = lower(a.name))))
      order by a.sort_order, a.name) from product_attributes a), '[]'::jsonb));
end $$;

create or replace function public.admin_save_category(_id uuid, _name text, _description text, _image text, _sort int)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; sl text;
begin
  perform public.admin_guard();
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de la catégorie.'; end if;
  if _id is null then
    sl := public.seller_subcategory_slug(_name);
    if exists (select 1 from categories where slug = sl) then raise exception 'Une catégorie porte déjà ce nom.'; end if;
    insert into categories (slug, name, description, image_url, sort_order)
    values (sl, btrim(_name), nullif(btrim(_description), ''), nullif(_image, ''), coalesce(_sort, (select coalesce(max(sort_order), 0) + 1 from categories)))
    returning id into rid;
  else
    update categories set name = btrim(_name), description = nullif(btrim(_description), ''), image_url = nullif(_image, ''),
      sort_order = coalesce(_sort, sort_order) where id = _id returning id into rid;
  end if;
  return rid;
end $$;

create or replace function public.admin_delete_category(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if exists (select 1 from categories c join products p on p.category_slug = c.slug where c.id = _id) then
    raise exception 'Cette catégorie contient des produits : elle ne peut pas être supprimée.';
  end if;
  delete from subcategories where category_id = _id;
  delete from categories where id = _id;
end $$;

create or replace function public.admin_save_subcategory(_id uuid, _category uuid, _name text, _description text, _image text, _active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; sl text;
begin
  perform public.admin_guard();
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le titre de la sous-catégorie.'; end if;
  if _category is null or not exists (select 1 from categories where id = _category) then raise exception 'Choisissez la catégorie parente.'; end if;
  if _id is null then
    sl := nullif(trim(both '-' from regexp_replace(lower(translate(btrim(_name), 'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '-', 'g')), '');
    if exists (select 1 from subcategories where slug = sl or lower(name) = lower(btrim(_name))) then raise exception 'Une sous-catégorie porte déjà ce nom.'; end if;
    insert into subcategories (category_id, slug, name, description, image_url, is_active, sort_order)
    values (_category, sl, btrim(_name), nullif(btrim(_description), ''), nullif(_image, ''), coalesce(_active, true),
            (select coalesce(max(sort_order), 0) + 1 from subcategories where category_id = _category))
    returning id into rid;
  else
    -- le titre peut changer ; l'adresse (slug) reste la même pour ne pas casser les produits déjà classés
    update subcategories set category_id = _category, name = btrim(_name), description = nullif(btrim(_description), ''),
      image_url = nullif(_image, ''), is_active = coalesce(_active, is_active) where id = _id returning id into rid;
    update products p set category_slug = c.slug from subcategories s join categories c on c.id = s.category_id
      where s.id = _id and p.subcategory_slug = s.slug and p.category_slug <> c.slug;
  end if;
  return rid;
end $$;

create or replace function public.admin_delete_subcategory(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if exists (select 1 from subcategories s join products p on p.subcategory_slug = s.slug where s.id = _id) then
    raise exception 'Des produits sont classés dans cette sous-catégorie : désactivez-la plutôt que de la supprimer.';
  end if;
  delete from subcategories where id = _id;
end $$;

create or replace function public.admin_save_brand(_id uuid, _name text, _logo text, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de la marque.'; end if;
  if _id is null then insert into brands (name, logo_url, is_active) values (btrim(_name), nullif(_logo, ''), coalesce(_active, true));
  else update brands set name = btrim(_name), logo_url = nullif(_logo, ''), is_active = coalesce(_active, is_active) where id = _id; end if;
exception when unique_violation then raise exception 'Cette marque existe déjà.';
end $$;

create or replace function public.admin_delete_brand(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard(); delete from brands where id = _id; end $$;

create or replace function public.admin_save_attribute(_id uuid, _name text, _kind text, _values text[], _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare vals text[];
begin
  perform public.admin_guard();
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de l''attribut.'; end if;
  if _kind not in ('text', 'color', 'size') then raise exception 'Type d''attribut invalide.'; end if;
  select coalesce(array_agg(v order by o), '{}') into vals from (
    select distinct on (lower(btrim(v))) btrim(v) v, o from unnest(coalesce(_values, '{}')) with ordinality u(v, o)
    where btrim(v) <> '' order by lower(btrim(v)), o) x;
  if _id is null then
    insert into product_attributes (name, kind, values, is_active, sort_order)
    values (btrim(_name), _kind, vals, coalesce(_active, true), (select coalesce(max(sort_order), 0) + 1 from product_attributes));
  else
    update product_attributes set name = btrim(_name), kind = _kind, values = vals, is_active = coalesce(_active, is_active) where id = _id;
  end if;
exception when unique_violation then raise exception 'Cet attribut existe déjà.';
end $$;

create or replace function public.admin_delete_attribute(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard(); delete from product_attributes where id = _id; end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_taxonomy()', 'admin_save_category(uuid,text,text,text,int)', 'admin_delete_category(uuid)',
    'admin_save_subcategory(uuid,uuid,text,text,text,boolean)', 'admin_delete_subcategory(uuid)',
    'admin_save_brand(uuid,text,text,boolean)', 'admin_delete_brand(uuid)',
    'admin_save_attribute(uuid,text,text,text[],boolean)', 'admin_delete_attribute(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 7. Position GPS partagée par le client à la commande (enregistrée dans l'adresse « GPS: lat, lng »)
create or replace function public.order_gps(_details text) returns jsonb
language sql immutable as $$
  select case when m is null then null else jsonb_build_object('lat', m[1]::numeric, 'lng', m[2]::numeric) end
  from (select regexp_match(coalesce(_details, ''), 'GPS:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)') m) x
$$;
do $$ declare def text; begin
  def := pg_get_functiondef('public.admin_orders(text,text,int)'::regprocedure);
  if position('''gps''' in def) = 0 then
    def := replace(def, '''channel'', o.traffic_channel,', '''channel'', o.traffic_channel, ''gps'', public.order_gps(o.address_details), ''address_details'', o.address_details,');
    execute def;
  end if;
end $$;
