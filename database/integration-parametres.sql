-- Paramètres du vendeur (privés : seller_profiles n'est lisible que par son titulaire et l'admin)
alter table seller_profiles add column if not exists avatar_url text;
alter table seller_profiles add column if not exists notif_prefs jsonb not null default '{}'::jsonb;
alter table seller_profiles add column if not exists dashboard_period int not null default 1 check (dashboard_period in (1, 7, 30, 365));

-- Les notifications désactivées par le vendeur ne sont plus créées
create or replace function public.notify_seller(_owner uuid, _kind text, _title text, _body text, _link text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.seller_notifications(owner_id, kind, title, body, link)
  select _owner, _kind, _title, _body, _link
  where _owner is not null
    and coalesce((select (sp.notif_prefs ->> _kind)::boolean from public.seller_profiles sp where sp.id = _owner), true);
$$;

-- Demandes d'aide envoyées depuis l'espace vendeur (traitées depuis l'espace admin)
create table if not exists seller_support_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  subject text not null check (length(subject) between 3 and 150),
  message text not null check (length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
alter table seller_support_requests enable row level security;
drop policy if exists "vendeur crée ses demandes" on seller_support_requests;
create policy "vendeur crée ses demandes" on seller_support_requests for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "vendeur lit ses demandes" on seller_support_requests;
create policy "vendeur lit ses demandes" on seller_support_requests for select to authenticated using (owner_id = auth.uid());
