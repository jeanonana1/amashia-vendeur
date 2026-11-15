-- Menu du site client : uniquement les catégories créées dans l'admin qui contiennent des produits en ligne,
-- (et « Promotions du jour » seulement s'il y a des ventes flash en cours). Mis à jour en temps réel.
create or replace function public.site_menu() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', x.n) order by c.sort_order nulls last, c.name)
      from categories c
      join lateral (select count(*) n from products p join sellers s on s.id = p.seller_id and s.is_active
                    where p.is_published and (p.category_slug = c.slug or p.subcategory_slug in (select sc.slug from categories sc where sc.parent_id = c.id))) x on x.n > 0
      where c.parent_id is null), '[]'::jsonb),
    'subcategories', coalesce((select jsonb_agg(c.slug) from categories c
      where c.parent_id is not null and exists (select 1 from products p where p.is_published and p.subcategory_slug = c.slug)), '[]'::jsonb),
    'promotions', (select count(*) from seller_flash_sales f join products p on p.id = f.product_id and p.is_published
                   where f.is_active and f.starts_at <= now() and f.ends_at > now()));
$$;
grant execute on function public.site_menu() to anon, authenticated;

-- Temps réel : nouvelles catégories / personnalisation du menu visibles immédiatement
drop policy if exists "Thème lisible par tous" on public.site_settings;
create policy "Thème lisible par tous" on public.site_settings for select to anon, authenticated using (key = 'theme');
grant select on public.site_settings to anon, authenticated;
do $$ begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_settings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.seller_flash_sales; exception when duplicate_object then null; end $$;
