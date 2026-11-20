-- Application Android Amashia Seller : jetons Firebase des téléphones des vendeurs (alertes de nouvelles commandes)
create table if not exists public.seller_fcm_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.seller_fcm_tokens enable row level security; -- accès par les fonctions uniquement

create or replace function public.seller_fcm_register(_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from sellers where owner_id = auth.uid()) then raise exception 'Réservé aux vendeurs.'; end if;
  if coalesce(length(_token), 0) < 20 then raise exception 'Jeton invalide.'; end if;
  insert into seller_fcm_tokens (token, user_id) values (_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, last_seen_at = now();
end $$;
grant execute on function public.seller_fcm_register(text) to authenticated;
