-- Site vendeur (pages publiques) : taux de commission réels par catégorie, lisibles sans compte.
create or replace function public.public_commission_rates() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'rate', c.commission_pct) order by c.sort_order nulls last, c.name), '[]'::jsonb)
  from categories c where c.commission_pct is not null;
$$;
grant execute on function public.public_commission_rates() to anon, authenticated;
