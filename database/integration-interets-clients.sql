-- Profil d'intérêt des clients connectés (fiches consultées, nombre de visites, temps passé),
-- pour des recommandations personnelles qui suivent le client sur tous ses appareils.
create table if not exists public.customer_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  views int not null default 0,
  dwell_s int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.customer_interests enable row level security;
revoke all on public.customer_interests from anon, authenticated;
create index if not exists customer_interests_user_last on public.customer_interests (user_id, last_at desc);

create or replace function public.track_interest(_product uuid, _views int default 0, _dwell int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into customer_interests (user_id, product_id, views, dwell_s, last_at)
  values (auth.uid(), _product, greatest(0, least(_views, 5)), greatest(0, least(_dwell, 900)), now())
  on conflict (user_id, product_id) do update set
    views = customer_interests.views + greatest(0, least(excluded.views, 5)),
    dwell_s = least(customer_interests.dwell_s + greatest(0, least(excluded.dwell_s, 900)), 36000),
    last_at = now();
exception when foreign_key_violation then null;
end $$;

create or replace function public.my_interests() returns table (product_id uuid, views int, dwell_s int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select product_id, views, dwell_s, last_at from customer_interests where user_id = auth.uid() order by last_at desc limit 200;
$$;
revoke all on function public.track_interest(uuid, int, int), public.my_interests() from public, anon;
grant execute on function public.track_interest(uuid, int, int), public.my_interests() to authenticated;
