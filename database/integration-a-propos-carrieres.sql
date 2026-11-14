-- Chiffres publics réels de la plateforme (page À propos) : totaux uniquement
create or replace function public.platform_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'products', (select count(*) from products where is_published),
    'sellers', (select count(*) from sellers where is_active),
    'categories', (select count(distinct category_slug) from products where is_published),
    'cities', (select count(distinct lower(trim(city))) from orders where status <> 'Annulée' and coalesce(city, '') <> ''),
    'orders_delivered', (select count(*) from orders where status = 'Livrée')
  );
$$;
grant execute on function public.platform_stats() to anon, authenticated;

-- Candidatures envoyées depuis la page Carrières (lecture réservée à l'équipe, plus tard via l'espace admin)
create table if not exists job_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text check (length(phone) <= 40),
  city text check (length(city) <= 80),
  area text not null check (length(area) <= 80),
  link text check (length(link) <= 300),
  message text not null check (length(message) between 20 and 3000),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table job_applications enable row level security;
drop policy if exists "envoyer une candidature" on job_applications;
create policy "envoyer une candidature" on job_applications for insert to anon, authenticated with check (true);
grant insert on job_applications to anon, authenticated;
