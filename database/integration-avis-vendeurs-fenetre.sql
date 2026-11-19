-- Fenêtre « Votre avis sur Amashia » : dernière fois qu'elle a été montrée au vendeur (toutes les 2 h tant qu'il n'a pas répondu)
alter table public.seller_profiles add column if not exists review_prompted_at timestamptz;

-- Lecture publique enrichie : nom de la boutique, logo, image de la catégorie (catégories / sous-catégories de la base)
create or replace function public.seller_platform_reviews_public()
returns jsonb language sql stable security definer set search_path = public as $$
  with pub as (
    select r.*, sp.first_name, sp.last_name, sp.city, sp.shop_name, sp.shop_logo_url,
           coalesce(nullif(sp.category, ''), sp.categories[1]) as category
    from public.seller_platform_reviews r join public.seller_profiles sp on sp.id = r.seller_id
    where r.is_published
  )
  select jsonb_build_object(
    'total', (select count(*) from pub),
    'avg', (select round(avg(rating)::numeric, 2) from pub),
    'dist', jsonb_build_object(
      '5', (select count(*) from pub where rating = 5), '4', (select count(*) from pub where rating = 4),
      '3', (select count(*) from pub where rating = 3), '2', (select count(*) from pub where rating = 2),
      '1', (select count(*) from pub where rating = 1)),
    'items', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object(
        'name', trim(initcap(coalesce(p.first_name, 'Vendeur')) || case when coalesce(p.last_name, '') <> '' then ' ' || upper(left(p.last_name, 1)) || '.' else '' end),
        'shop', coalesce(p.shop_name, ''),
        'logo', nullif(p.shop_logo_url, ''),
        'city', initcap(coalesce(p.city, '')), 'category', coalesce(p.category, ''), 'rating', p.rating, 'text', p.body, 'at', p.created_at, 'collected', p.source = 'admin',
        'img', coalesce(
          (select nullif(c.image_url, '') from public.categories c where lower(c.name) = lower(p.category) limit 1),
          (select nullif(s.image_url, '') from public.subcategories s where lower(s.name) = lower(p.category) limit 1),
          (select nullif(c.image_url, '') from public.categories c where lower(c.name) like lower(split_part(p.category, ' ', 1)) || '%' and coalesce(c.image_url, '') <> '' limit 1))
      ) as x from pub p order by p.created_at desc limit 10) t), '[]'::jsonb)
  );
$$;
grant execute on function public.seller_platform_reviews_public() to anon, authenticated;
