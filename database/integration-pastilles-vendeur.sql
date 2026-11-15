-- Pastille du menu « Retours » : demandes qui attendent une action du vendeur
-- (nouvelle demande à accepter/refuser, ou article reçu à rembourser).
create or replace function public.seller_returns_todo_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.return_requests r
  where r.status in ('requested', 'received')
    and r.seller_id in (select id from public.sellers where owner_id = auth.uid());
$$;
revoke all on function public.seller_returns_todo_count() from public, anon;
grant execute on function public.seller_returns_todo_count() to authenticated;
