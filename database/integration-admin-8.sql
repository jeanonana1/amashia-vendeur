-- Amashia — Admin, étape 8 : sécurité.
--  * Double authentification (code à 6 chiffres, application d'authentification) obligatoire pour tout administrateur :
--    toutes les fonctions admin exigent une session « aal2 ».
--  * Équipe : chaque administrateur a des droits par section ; la base refuse toute action hors de ses droits.
--  * Invitations : fiche de la personne, lien d'invitation, acceptation (mot de passe + double authentification).
--  * Journal des connexions.

-- 1. Tables -----------------------------------------------------------------------------------------
create table if not exists public.admin_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  job_title text,
  id_number text,
  address text,
  city text,
  birth_date date,
  notes text,
  is_super boolean not null default false,
  permissions text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  email text not null,
  full_name text not null,
  phone text,
  job_title text,
  id_number text,
  address text,
  city text,
  birth_date date,
  notes text,
  is_super boolean not null default false,
  permissions text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create table if not exists public.admin_login_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_fn_sections (fn text primary key, sections text[] not null);
alter table public.admin_staff enable row level security;
alter table public.admin_invites enable row level security;
alter table public.admin_login_log enable row level security;
alter table public.admin_fn_sections enable row level security;

-- Les administrateurs actuels deviennent super administrateurs
insert into public.admin_staff (user_id, full_name, email, is_super)
select r.user_id, coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)), u.email, true
from public.user_roles r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id
where r.role = 'admin'
on conflict (user_id) do nothing;

-- 2. Section de chaque fonction admin (« * » = tout membre de l'équipe) -------------------------------
insert into public.admin_fn_sections (fn, sections) values
  ('admin_notifications', '{*}'), ('admin_search', '{*}'), ('admin_latest_order', '{*}'), ('admin_me', '{*}'),
  ('admin_dashboard', '{dashboard,analytics,finance}'), ('admin_dashboard_range', '{dashboard,analytics}'), ('admin_top_products', '{dashboard,analytics,produits}'),
  ('admin_live', '{activite,analytics}'), ('admin_live_minutes', '{activite,analytics}'),
  ('admin_customers', '{clients,analytics}'),
  ('admin_sellers', '{vendeurs,analytics}'), ('admin_set_seller_active', '{vendeurs}'), ('admin_seller_performance', '{vendeurs,analytics}'), ('admin_seller_detail', '{vendeurs,analytics}'),
  ('admin_kyc', '{vendeurs,produits}'), ('admin_set_kyc', '{vendeurs}'), ('admin_support', '{vendeurs,clients}'), ('admin_update_support', '{vendeurs,clients}'),
  ('admin_products', '{produits,vendeurs,analytics}'), ('admin_set_product_published', '{produits,vendeurs}'), ('admin_reports', '{produits}'), ('admin_update_report', '{produits}'),
  ('admin_taxonomy', '{produits}'), ('admin_save_category', '{produits}'), ('admin_delete_category', '{produits}'), ('admin_save_subcategory', '{produits}'), ('admin_delete_subcategory', '{produits}'),
  ('admin_save_brand', '{produits}'), ('admin_delete_brand', '{produits}'), ('admin_save_attribute', '{produits}'), ('admin_delete_attribute', '{produits}'),
  ('admin_orders', '{commandes,clients,vendeurs}'), ('admin_order_detail', '{commandes,clients,vendeurs}'), ('admin_cancel_order', '{commandes}'), ('admin_set_order_status', '{commandes}'),
  ('admin_returns', '{commandes,clients}'), ('admin_update_return', '{commandes}'),
  ('admin_finance', '{finance}'), ('admin_commissions', '{finance,parametres}'), ('admin_set_commission', '{finance,parametres,produits}'),
  ('admin_withdrawals', '{finance,vendeurs}'), ('admin_update_withdrawal', '{finance}'),
  ('admin_prime', '{prime,clients,finance,parametres}'), ('admin_grant_prime', '{prime}'), ('admin_grant_prime_plan', '{prime,clients}'), ('admin_cancel_prime', '{prime,clients}'),
  ('admin_save_prime_plan', '{prime}'), ('admin_delete_prime_plan', '{prime}'),
  ('admin_logistics', '{livreurs,livraison,commandes}'), ('admin_save_courier', '{livreurs}'), ('admin_set_courier', '{livreurs}'), ('admin_delete_courier', '{livreurs}'),
  ('admin_pay_courier', '{livreurs}'), ('admin_save_incident', '{livreurs}'), ('admin_assign_delivery', '{livreurs,livraison,commandes}'), ('admin_update_delivery', '{livreurs,livraison,commandes}'),
  ('admin_parcels', '{livreurs,livraison,commandes}'), ('admin_save_carrier', '{livraison}'), ('admin_delete_carrier', '{livraison}'),
  ('admin_settings', '{livraison,parametres,livreurs}'), ('admin_update_settings', '{livraison,parametres,prime}'), ('admin_save_zone', '{livraison}'), ('admin_delete_zone', '{livraison}'),
  ('admin_shipping_stats', '{livraison,livreurs,parametres}'),
  ('admin_marketing', '{marketing}'), ('admin_marketing_products', '{marketing}'), ('admin_save_coupon', '{marketing}'), ('admin_save_flash', '{marketing}'),
  ('admin_save_campaign', '{marketing}'), ('admin_delete_marketing', '{marketing}'), ('admin_banners', '{marketing}'), ('admin_save_banner', '{marketing}'),
  ('admin_move_banner', '{marketing}'), ('admin_delete_banner', '{marketing}'), ('admin_messages', '{marketing}'), ('admin_save_message', '{marketing}'), ('admin_delete_message', '{marketing}'),
  ('admin_reviews', '{avis,clients,vendeurs}'), ('admin_delete_review', '{avis}'),
  ('admin_site_theme', '{personnalisation}'), ('admin_save_site_theme', '{personnalisation}'),
  ('admin_pages', '{contenu}'), ('admin_save_page', '{contenu}'), ('admin_reset_page', '{contenu}')
on conflict (fn) do update set sections = excluded.sections;
-- non listées (administrateurs, sécurité…) : réservées aux super administrateurs

-- 3. Contrôles -----------------------------------------------------------------------------------------
-- « admin » n'est reconnu que si la session a validé la double authentification
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    and (_role <> 'admin' or _user_id is distinct from auth.uid() or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
    and (_role <> 'admin' or not exists (select 1 from public.admin_staff s where s.user_id = _user_id and s.status = 'suspended'))
$$;

-- Garde de toutes les fonctions admin : rôle + double authentification + droits de la section
create or replace function public.admin_guard(_fn text default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.admin_staff; secs text[];
begin
  if uid is null or not exists (select 1 from public.user_roles where user_id = uid and role = 'admin') then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Double authentification requise : saisissez le code de votre application d''authentification.' using errcode = '42501';
  end if;
  select * into s from public.admin_staff where user_id = uid;
  if s.user_id is null or s.status <> 'active' then raise exception 'Compte administrateur désactivé.' using errcode = '42501'; end if;
  if s.is_super then return; end if;
  select sections into secs from public.admin_fn_sections where fn = _fn;
  if secs is null then raise exception 'Action réservée aux super administrateurs.' using errcode = '42501'; end if;
  if '*' = any(secs) or secs && s.permissions then return; end if;
  raise exception 'Vous n''avez pas accès à cette section.' using errcode = '42501';
end $$;

-- Chaque fonction admin se présente à la garde avec son nom
do $$
declare r record; def text;
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%admin_guard()%' and p.proname <> 'admin_guard' loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'public.admin_guard()', 'public.admin_guard(''' || r.proname || ''')');
    execute def;
  end loop;
end $$;

-- 4. Moi (droits pour griser le menu), candidature à la connexion, journal ----------------------------------
create or replace function public.admin_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.admin_staff;
begin
  perform public.admin_guard('admin_me');
  select * into s from admin_staff where user_id = auth.uid();
  return jsonb_build_object('user_id', s.user_id, 'full_name', s.full_name, 'email', s.email, 'phone', s.phone, 'job_title', s.job_title,
    'is_super', s.is_super, 'permissions', to_jsonb(s.permissions));
end $$;

-- Avant la double authentification : ce compte est-il administrateur (ou invité) ? Ne révèle que son propre statut.
create or replace function public.admin_candidate() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin', exists (select 1 from user_roles r where r.user_id = auth.uid() and r.role = 'admin')
             and not exists (select 1 from admin_staff s where s.user_id = auth.uid() and s.status = 'suspended'),
    'invited', exists (select 1 from admin_invites i join auth.users u on lower(u.email) = lower(i.email)
                       where u.id = auth.uid() and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()))
$$;

create or replace function public.admin_log_login() returns void
language plpgsql security definer set search_path = public as $$
declare h jsonb;
begin
  perform public.admin_guard('admin_me');
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  insert into admin_login_log (user_id, email, ip, user_agent)
  values (auth.uid(), (select email from auth.users where id = auth.uid()),
    split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1), left(h ->> 'user-agent', 300));
end $$;

-- 5. Gestion de l'équipe (super administrateurs) ------------------------------------------------------------
create or replace function public.admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_staff_list');
  return jsonb_build_object(
    'staff', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'last_sign_in', u.last_sign_in_at, 'me', s.user_id = auth.uid(),
        'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified'),
        'logins_30d', (select count(*) from admin_login_log l where l.user_id = s.user_id and l.created_at > now() - interval '30 days'))
      order by s.is_super desc, s.created_at) from admin_staff s join auth.users u on u.id = s.user_id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'token', i.token, 'email', i.email, 'full_name', i.full_name, 'phone', i.phone,
        'job_title', i.job_title, 'is_super', i.is_super, 'permissions', to_jsonb(i.permissions), 'created_at', i.created_at, 'expires_at', i.expires_at,
        'expired', i.expires_at <= now()) order by i.created_at desc)
      from admin_invites i where i.accepted_at is null and i.cancelled_at is null), '[]'::jsonb),
    'logins', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('name', s.full_name) order by l.created_at desc)
      from (select * from admin_login_log order by created_at desc limit 200) l left join admin_staff s on s.user_id = l.user_id), '[]'::jsonb));
end $$;

create or replace function public.admin_invite_staff(_s jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare em text := lower(btrim(coalesce(_s->>'email', ''))); inv admin_invites; uid uuid;
begin
  perform public.admin_guard('admin_invite_staff');
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  if coalesce(btrim(_s->>'full_name'), '') = '' then raise exception 'Indiquez le nom de la personne.'; end if;
  if exists (select 1 from admin_staff where lower(email) = em) then raise exception 'Cette personne fait déjà partie de l''équipe.'; end if;
  update admin_invites set cancelled_at = now() where lower(email) = em and accepted_at is null and cancelled_at is null;
  insert into admin_invites (email, full_name, phone, job_title, id_number, address, city, birth_date, notes, is_super, permissions, created_by)
  values (em, btrim(_s->>'full_name'), nullif(btrim(_s->>'phone'), ''), nullif(btrim(_s->>'job_title'), ''), nullif(btrim(_s->>'id_number'), ''),
    nullif(btrim(_s->>'address'), ''), nullif(btrim(_s->>'city'), ''), nullif(_s->>'birth_date', '')::date, nullif(btrim(_s->>'notes'), ''),
    coalesce((_s->>'is_super')::boolean, false),
    coalesce((select array_agg(v) from jsonb_array_elements_text(_s->'permissions') v), '{}'), auth.uid())
  returning * into inv;
  -- compte déjà existant : marqué « invité » pour que l'e-mail reçu soit celui de l'invitation
  select id into uid from auth.users where lower(email) = em;
  if uid is not null then
    update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('amashia_invite', 'admin', 'amashia_invite_name', inv.full_name) where id = uid;
  end if;
  return jsonb_build_object('id', inv.id, 'token', inv.token, 'email', inv.email, 'account_exists', uid is not null);
end $$;

create or replace function public.admin_cancel_invite(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard('admin_cancel_invite'); update admin_invites set cancelled_at = now() where id = _id and accepted_at is null; end $$;

create or replace function public.admin_update_staff(_user uuid, _s jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_update_staff');
  if _user = auth.uid() and (coalesce((_s->>'is_super')::boolean, true) = false or coalesce(_s->>'status', 'active') <> 'active') then
    raise exception 'Vous ne pouvez pas retirer vos propres droits de super administrateur.';
  end if;
  update admin_staff set
    full_name = coalesce(nullif(btrim(_s->>'full_name'), ''), full_name), phone = nullif(btrim(_s->>'phone'), ''), job_title = nullif(btrim(_s->>'job_title'), ''),
    id_number = nullif(btrim(_s->>'id_number'), ''), address = nullif(btrim(_s->>'address'), ''), city = nullif(btrim(_s->>'city'), ''),
    birth_date = nullif(_s->>'birth_date', '')::date, notes = nullif(btrim(_s->>'notes'), ''),
    is_super = coalesce((_s->>'is_super')::boolean, is_super), status = coalesce(nullif(_s->>'status', ''), status),
    permissions = coalesce((select array_agg(v) from jsonb_array_elements_text(_s->'permissions') v), permissions), updated_at = now()
  where user_id = _user;
end $$;

create or replace function public.admin_remove_staff(_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_remove_staff');
  if _user = auth.uid() then raise exception 'Vous ne pouvez pas vous retirer vous-même.'; end if;
  delete from user_roles where user_id = _user and role = 'admin';
  delete from admin_staff where user_id = _user;
end $$;

-- Les anciennes fonctions d'ajout / retrait passent par l'équipe
create or replace function public.admin_grant_admin(_email text) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'Utilisez « Ajouter un membre » : la personne reçoit une invitation et active la double authentification.'; end $$;
create or replace function public.admin_revoke_admin(_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_remove_staff(_user); end $$;

-- 6. Invitation (côté invité) -----------------------------------------------------------------------------
-- Aperçu par le lien d'invitation (sans connexion) : uniquement avec le jeton secret
create or replace function public.invite_preview(_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when i.id is null then null else jsonb_build_object(
    'email', i.email, 'full_name', i.full_name, 'phone', i.phone, 'job_title', i.job_title, 'id_number', i.id_number, 'address', i.address,
    'city', i.city, 'birth_date', i.birth_date, 'is_super', i.is_super, 'permissions', to_jsonb(i.permissions), 'expires_at', i.expires_at,
    'account_exists', exists (select 1 from auth.users u where lower(u.email) = lower(i.email)),
    'invited_by', (select full_name from admin_staff s where s.user_id = i.created_by)) end
  from (select 1) d left join admin_invites i on i.token = _token and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
$$;

-- Compte créé depuis la page d'invitation : l'adresse est considérée comme confirmée (le jeton secret a été reçu)
create or replace function public.invite_confirm_signup(_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare em text;
begin
  select email into em from admin_invites where token = _token and accepted_at is null and cancelled_at is null and expires_at > now();
  if em is null then return false; end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('amashia_invite', 'admin')
  where lower(email) = lower(em) and created_at > now() - interval '1 hour';
  return found;
end $$;

-- Invitation de la personne connectée (arrivée par l'e-mail)
create or replace function public.admin_my_invite() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.invite_preview(i.token) || jsonb_build_object('token', i.token)
  from admin_invites i join auth.users u on lower(u.email) = lower(i.email)
  where u.id = auth.uid() and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
  order by i.created_at desc limit 1
$$;

-- Acceptation : uniquement par la personne invitée, après la double authentification
create or replace function public.admin_accept_invite() returns void
language plpgsql security definer set search_path = public as $$
declare i admin_invites; em text;
begin
  select email into em from auth.users where id = auth.uid();
  select * into i from admin_invites where lower(email) = lower(em) and accepted_at is null and cancelled_at is null and expires_at > now() order by created_at desc limit 1;
  if i.id is null then raise exception 'Invitation introuvable ou expirée.'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then raise exception 'Activez d''abord la double authentification.'; end if;
  insert into user_roles (user_id, role) values (auth.uid(), 'admin') on conflict do nothing;
  insert into admin_staff (user_id, full_name, email, phone, job_title, id_number, address, city, birth_date, notes, is_super, permissions, invited_by)
  values (auth.uid(), i.full_name, em, i.phone, i.job_title, i.id_number, i.address, i.city, i.birth_date, i.notes, i.is_super, i.permissions, i.created_by)
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone, job_title = excluded.job_title, is_super = excluded.is_super,
    permissions = excluded.permissions, status = 'active', updated_at = now();
  update admin_invites set accepted_at = now() where id = i.id;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'amashia_invite' - 'amashia_invite_name' where id = auth.uid();
end $$;

-- Droits d'exécution
do $$
declare f text;
begin
  foreach f in array array['admin_me()', 'admin_log_login()', 'admin_staff_list()', 'admin_invite_staff(jsonb)', 'admin_cancel_invite(uuid)',
    'admin_update_staff(uuid,jsonb)', 'admin_remove_staff(uuid)', 'admin_candidate()', 'admin_my_invite()', 'admin_accept_invite()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.invite_confirm_signup(text) to anon, authenticated;

-- Création du compte depuis le lien d'invitation (sans dépendre de l'envoi d'e-mails) :
-- uniquement avec le jeton secret de l'invitation, et seulement si aucun compte n'existe pour cette adresse.
create or replace function public.invite_create_account(_token text, _password text) returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
declare i admin_invites; uid uuid := gen_random_uuid();
begin
  select * into i from admin_invites where token = _token and accepted_at is null and cancelled_at is null and expires_at > now();
  if i.id is null then raise exception 'Invitation introuvable ou expirée.'; end if;
  if length(coalesce(_password, '')) < 10 or _password !~ '[A-Za-z]' or _password !~ '[0-9]' then
    raise exception 'Mot de passe trop faible : au moins 10 caractères, avec des lettres et des chiffres.';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(i.email)) then raise exception 'Un compte existe déjà pour cette adresse : connectez-vous avec son mot de passe.'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(i.email), extensions.crypt(_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', i.full_name, 'amashia_invite', 'admin'),
    now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', lower(i.email), 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
  return true;
end $$;
revoke execute on function public.invite_create_account(text, text) from public;
grant execute on function public.invite_create_account(text, text) to anon, authenticated;

-- L'ancienne garde sans nom de fonction est supprimée (toutes les fonctions passent leur nom).
drop function if exists public.admin_guard();

-- 7. Accès direct aux tables : réservé aux super administrateurs (les membres passent par les fonctions contrôlées)
create or replace function public.staff_can(_section text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (
    select 1 from public.admin_staff s join public.user_roles r on r.user_id = s.user_id and r.role = 'admin'
    where s.user_id = auth.uid() and s.status = 'active' and (s.is_super or _section = any(s.permissions)))
$$;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    and (_role <> 'admin' or _user_id is distinct from auth.uid() or (
      coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      and exists (select 1 from public.admin_staff s where s.user_id = _user_id and s.status = 'active' and s.is_super)))
$$;
drop policy if exists "Admins read seller docs" on storage.objects;
create policy "Admins read seller docs" on storage.objects for select
  using (bucket_id = 'seller-documents' and public.staff_can('vendeurs'));
