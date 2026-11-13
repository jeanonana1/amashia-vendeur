-- Pastille « nouveaux avis » dans le menu vendeur : avis reçus depuis la dernière visite de la page Avis
alter table public.seller_profiles add column if not exists reviews_seen_at timestamptz;

create or replace function public.seller_new_reviews_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.reviews r
  join public.products p on p.id = r.product_id
  join public.sellers s on s.id = p.seller_id
  left join public.seller_profiles sp on sp.id = s.owner_id
  where s.owner_id = auth.uid() and r.created_at > coalesce(sp.reviews_seen_at, '-infinity'::timestamptz);
$$;
grant execute on function public.seller_new_reviews_count() to authenticated;

create or replace function public.mark_reviews_seen()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare prev timestamptz;
begin
  select reviews_seen_at into prev from public.seller_profiles where id = auth.uid();
  update public.seller_profiles set reviews_seen_at = now() where id = auth.uid();
  return prev; -- visite précédente (pour marquer les avis « Nouveau »)
end $$;
grant execute on function public.mark_reviews_seen() to authenticated;
