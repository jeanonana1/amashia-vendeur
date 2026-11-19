-- Avis des vendeurs sur Amashia (section « Ils vendent sur Amashia » de la page d'accueil vendeur)
-- Un avis par vendeur, modifiable par lui ; seuls les avis publiés sont visibles publiquement.
create table if not exists public.seller_platform_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 15 and 240),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seller_platform_reviews enable row level security;

drop policy if exists "Vendeur : lire son avis" on public.seller_platform_reviews;
create policy "Vendeur : lire son avis" on public.seller_platform_reviews for select to authenticated using (seller_id = auth.uid());
drop policy if exists "Vendeur : écrire son avis" on public.seller_platform_reviews;
create policy "Vendeur : écrire son avis" on public.seller_platform_reviews for insert to authenticated
  with check (seller_id = auth.uid() and exists (select 1 from public.seller_profiles sp where sp.id = auth.uid()));
drop policy if exists "Vendeur : modifier son avis" on public.seller_platform_reviews;
create policy "Vendeur : modifier son avis" on public.seller_platform_reviews for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Vendeur : supprimer son avis" on public.seller_platform_reviews;
create policy "Vendeur : supprimer son avis" on public.seller_platform_reviews for delete to authenticated using (seller_id = auth.uid());

create or replace function public.seller_platform_reviews_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.body := btrim(new.body); return new; end $$;
drop trigger if exists seller_platform_reviews_touch on public.seller_platform_reviews;
create trigger seller_platform_reviews_touch before insert or update on public.seller_platform_reviews
  for each row execute function public.seller_platform_reviews_touch();

-- Lecture publique : répartition des notes + 10 derniers avis (prénom + initiale, ville, catégorie, photo de la boutique)
create or replace function public.seller_platform_reviews_public()
returns jsonb language sql stable security definer set search_path = public as $$
  with pub as (
    select r.*, sp.first_name, sp.last_name, sp.city, coalesce(nullif(sp.category, ''), sp.categories[1]) as category,
           sp.shop_banner_url, sp.shop_logo_url
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
        'city', initcap(coalesce(p.city, '')), 'category', coalesce(p.category, ''), 'rating', p.rating, 'text', p.body, 'at', p.created_at,
        'img', coalesce(nullif(p.shop_banner_url, ''),
          (select sl.images[1] from public.seller_listings sl where sl.seller_id = p.seller_id and sl.status = 'published' and coalesce(array_length(sl.images, 1), 0) > 0 order by sl.published_at desc limit 1),
          nullif(p.shop_logo_url, ''))
      ) as x from pub p order by p.created_at desc limit 10) t), '[]'::jsonb)
  );
$$;
revoke all on function public.seller_platform_reviews_public() from public;
grant execute on function public.seller_platform_reviews_public() to anon, authenticated;
