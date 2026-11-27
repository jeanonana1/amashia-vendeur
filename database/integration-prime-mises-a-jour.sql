-- Journal des mises à jour de l'application Prime (APK) : chaque tentative envoie son résultat exact
-- (code et message d'Android, téléphone, version de départ et d'arrivée). Sert au diagnostic : lecture
-- réservée au service (aucune lecture depuis les applications).
create table if not exists public.prime_update_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  from_build int,
  to_build int,
  stage text not null check (stage in ('download_error', 'install_status', 'installed')),
  status int,
  message text,
  device text,
  android text
);
alter table public.prime_update_events enable row level security;
drop policy if exists prime_update_events_insert on public.prime_update_events;
create policy prime_update_events_insert on public.prime_update_events for insert to anon, authenticated
  with check (length(coalesce(message, '')) <= 1000 and length(coalesce(device, '')) <= 200 and length(coalesce(android, '')) <= 100);
grant insert on public.prime_update_events to anon, authenticated;
grant usage on sequence public.prime_update_events_id_seq to anon, authenticated;
