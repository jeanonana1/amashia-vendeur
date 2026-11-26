-- Catalogue léger du site client : uniquement ce qu'il faut pour afficher les fiches en liste
-- (vignettes, prix, notes, filtres, recherche, recommandations). Le détail complet d'un produit
-- (description, caractéristiques, variantes, avis) n'est chargé qu'à l'ouverture de sa page.
-- Exécutée avec les droits du visiteur : mêmes règles d'accès que la lecture directe des tables.
create or replace function public.catalog_cards() returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title,
    'brand', coalesce(nullif(p.brand, ''), p.specs->>'Brand', p.specs->>'Marque'),
    'price_fcfa', p.price_fcfa, 'original_price_fcfa', p.original_price_fcfa, 'stock', p.stock,
    -- 2 photos suffisent pour les listes (la 2e sert au survol)
    'images', case when jsonb_typeof(p.images) = 'array' then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(p.images) with ordinality t(e, n) where n <= 2) x) else '[]'::jsonb end,
    'sales', p.sales, 'badge', p.badge, 'category_slug', p.category_slug, 'subcategory_slug', p.subcategory_slug,
    'colors', p.colors, 'variant_prices', p.variant_prices,
    -- texte de la description (sans mise en forme), limité : sert uniquement à la recherche
    'search_text', left(regexp_replace(regexp_replace(coalesce(p.description, ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'), 400),
    'seller_flash_sales', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'value', f.value, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'is_active', f.is_active)), '[]'::jsonb)
                           from seller_flash_sales f where f.product_id = p.id and f.is_active and f.ends_at > now()),
    'sellers', (select jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug) from sellers s where s.id = p.seller_id and s.is_active),
    'rating_avg', r.avg, 'reviews_n', coalesce(r.n, 0)
  ) order by p.created_at), '[]'::jsonb)
  from products p
  left join lateral (select round(avg(rating)::numeric, 1) avg, count(*) n from reviews where product_id = p.id) r on true
  where p.is_published;
$$;
grant execute on function public.catalog_cards() to anon, authenticated;
