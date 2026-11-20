-- Amachia — Admin, étape 2 : réglages de livraison, zones, Prime, KYC vendeurs, administrateurs.
-- Additif : ne supprime aucune donnée. Les valeurs par défaut reprennent exactement les règles actuelles
-- (1 500 FCFA, livraison gratuite au-dessus de 50 000 FCFA, livraison estimée à 5 jours).

-- 1. Réglages de la plateforme (une seule ligne) -------------------------------------------------
create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  shipping_fee int not null default 1500 check (shipping_fee >= 0),
  free_shipping_threshold int not null default 50000 check (free_shipping_threshold >= 0),
  delivery_days int not null default 5 check (delivery_days between 1 and 60),
  prime_price int not null default 2500 check (prime_price >= 0),
  prime_free_shipping boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict do nothing;
alter table public.platform_settings enable row level security;
drop policy if exists "Lecture publique des réglages" on public.platform_settings;
create policy "Lecture publique des réglages" on public.platform_settings for select using (true);

-- 2. Zones de livraison : tarif propre à une ville (sinon le tarif général s'applique) -----------
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  fee int not null check (fee >= 0),
  free_threshold int check (free_threshold >= 0),
  days int check (days between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists delivery_zones_city_uq on public.delivery_zones (lower(btrim(city)));
alter table public.delivery_zones enable row level security;
drop policy if exists "Lecture publique des zones" on public.delivery_zones;
create policy "Lecture publique des zones" on public.delivery_zones for select using (true);

-- Prime actif ?
create or replace function public.prime_active(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prime_subscriptions
                 where user_id = _uid and is_active and starts_at <= now() and expires_at > now())
$$;

-- Devis de livraison : même calcul pour le site client (affichage) et la commande (base).
create or replace function public.delivery_quote(_city text, _subtotal int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.platform_settings; z public.delivery_zones; fee int; thr int; d int; prime boolean := false;
begin
  select * into s from public.platform_settings where id = 1;
  select * into z from public.delivery_zones where is_active and lower(btrim(city)) = lower(btrim(coalesce(_city, ''))) limit 1;
  fee := coalesce(z.fee, s.shipping_fee);
  thr := coalesce(z.free_threshold, s.free_shipping_threshold);
  d := coalesce(z.days, s.delivery_days);
  if auth.uid() is not null and s.prime_free_shipping then prime := public.prime_active(auth.uid()); end if;
  return jsonb_build_object(
    'fee', case when prime or (thr > 0 and coalesce(_subtotal, 0) > thr) then 0 else fee end,
    'base_fee', fee, 'free_threshold', thr, 'days', d, 'prime', prime, 'zone', z.city);
end $$;
grant execute on function public.delivery_quote(text, int) to anon, authenticated;
revoke execute on function public.prime_active(uuid) from public, anon;

-- La commande utilise désormais le devis (au lieu de la règle écrite en dur).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.customer_checkout(uuid,jsonb,jsonb)'::regprocedure);
  if position('fee:=CASE WHEN sub>50000 THEN 0 ELSE 1500 END;' in def) > 0 then
    def := replace(def, 'fee:=CASE WHEN sub>50000 THEN 0 ELSE 1500 END;',
                   'fee:=(public.delivery_quote(p_details->>''city'',sub)->>''fee'')::int;');
    execute def;
  end if;
end $$;

-- 3. KYC vendeurs ------------------------------------------------------------------------------
alter table public.sellers add column if not exists kyc_status text not null default 'pending';
alter table public.sellers add column if not exists kyc_note text;
alter table public.sellers add column if not exists kyc_reviewed_at timestamptz;
do $$ begin
  alter table public.sellers add constraint sellers_kyc_status_chk check (kyc_status in ('pending','approved','rejected'));
exception when duplicate_object then null; end $$;

drop policy if exists "Admins read seller docs" on storage.objects;
create policy "Admins read seller docs" on storage.objects for select
  using (bucket_id = 'seller-documents' and public.has_role(auth.uid(), 'admin'));

create or replace function public.admin_kyc() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(x order by x->>'status' desc, x->>'created_at' desc) from (
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'city', s.city, 'created_at', s.created_at,
      'status', s.kyc_status, 'note', s.kyc_note, 'reviewed_at', s.kyc_reviewed_at, 'is_active', s.is_active,
      'owner', trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')),
      'account_type', sp.account_type, 'niu', sp.niu, 'phone', sp.phone, 'email', u.email,
      'region', sp.region, 'address', sp.shop_address,
      'docs', coalesce((select jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.file_url, 'at', d.created_at) order by d.created_at)
                        from public.seller_documents d where d.user_id = s.owner_id), '[]'::jsonb)) x
    from public.sellers s
    left join public.seller_profiles sp on sp.id = s.owner_id
    left join auth.users u on u.id = s.owner_id) t), '[]'::jsonb);
end $$;

create or replace function public.admin_set_kyc(_seller uuid, _status text, _note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _status not in ('pending','approved','rejected') then raise exception 'Statut invalide'; end if;
  if _status = 'rejected' and coalesce(btrim(_note), '') = '' then raise exception 'Indiquez la raison du refus.'; end if;
  update public.sellers set kyc_status = _status, kyc_note = nullif(btrim(_note), ''), kyc_reviewed_at = now() where id = _seller;
  if not found then raise exception 'Vendeur introuvable'; end if;
end $$;

-- 4. Réglages et zones (admin) ------------------------------------------------------------------
create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from public.platform_settings s where id = 1),
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.city) from public.delivery_zones z), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'orders', n) order by n desc) from (
        select initcap(btrim(city)) city, count(*) n from public.orders where coalesce(btrim(city),'') <> '' group by 1) c), '[]'::jsonb));
end $$;

create or replace function public.admin_update_settings(_s jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  update public.platform_settings set
    shipping_fee = coalesce((_s->>'shipping_fee')::int, shipping_fee),
    free_shipping_threshold = coalesce((_s->>'free_shipping_threshold')::int, free_shipping_threshold),
    delivery_days = coalesce((_s->>'delivery_days')::int, delivery_days),
    prime_price = coalesce((_s->>'prime_price')::int, prime_price),
    prime_free_shipping = coalesce((_s->>'prime_free_shipping')::boolean, prime_free_shipping),
    updated_at = now()
  where id = 1;
end $$;

create or replace function public.admin_save_zone(_id uuid, _city text, _fee int, _free int, _days int, _active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if coalesce(btrim(_city), '') = '' then raise exception 'Indiquez la ville.'; end if;
  if _fee is null or _fee < 0 then raise exception 'Frais invalides.'; end if;
  if _id is null then
    insert into public.delivery_zones (city, fee, free_threshold, days, is_active) values (initcap(btrim(_city)), _fee, _free, _days, coalesce(_active, true));
  else
    update public.delivery_zones set city = initcap(btrim(_city)), fee = _fee, free_threshold = _free, days = _days, is_active = coalesce(_active, true) where id = _id;
  end if;
exception when unique_violation then raise exception 'Cette ville a déjà un tarif.';
end $$;

create or replace function public.admin_delete_zone(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard(); delete from public.delivery_zones where id = _id; end $$;

-- 5. Prime (admin) -------------------------------------------------------------------------------
create or replace function public.admin_prime() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'price', (select prime_price from public.platform_settings where id = 1),
    'free_shipping', (select prime_free_shipping from public.platform_settings where id = 1),
    'active', (select count(distinct user_id) from public.prime_subscriptions where is_active and starts_at <= now() and expires_at > now()),
    'members', coalesce((select jsonb_agg(x order by x->>'expires_at' desc) from (
      select jsonb_build_object('id', p.id, 'user_id', p.user_id, 'name', coalesce(pr.full_name, ''), 'email', u.email,
        'starts_at', p.starts_at, 'expires_at', p.expires_at,
        'active', p.is_active and p.starts_at <= now() and p.expires_at > now(), 'cancelled', not p.is_active) x
      from public.prime_subscriptions p left join public.profiles pr on pr.id = p.user_id left join auth.users u on u.id = p.user_id) t), '[]'::jsonb));
end $$;

create or replace function public.admin_grant_prime(_email text, _months int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; cur timestamptz;
begin
  perform public.admin_guard();
  if _months is null or _months < 1 or _months > 24 then raise exception 'Durée invalide (1 à 24 mois).'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(_email));
  if uid is null then raise exception 'Aucun compte client avec cet e-mail.'; end if;
  select max(expires_at) into cur from public.prime_subscriptions where user_id = uid and is_active and expires_at > now();
  insert into public.prime_subscriptions (user_id, starts_at, expires_at, is_active)
  values (uid, coalesce(cur, now()), coalesce(cur, now()) + make_interval(months => _months), true);
end $$;

create or replace function public.admin_cancel_prime(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard(); update public.prime_subscriptions set is_active = false where id = _id; end $$;

-- Statut Prime du client connecté (pour sa page « Amachia Prime »)
create or replace function public.customer_prime() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active', public.prime_active(auth.uid()),
    'expires_at', (select max(expires_at) from public.prime_subscriptions where user_id = auth.uid() and is_active and expires_at > now()),
    'price', s.prime_price, 'free_shipping', s.prime_free_shipping)
  from public.platform_settings s where s.id = 1
$$;
revoke execute on function public.customer_prime() from public, anon;
grant execute on function public.customer_prime() to authenticated;

-- 6. Administrateurs -----------------------------------------------------------------------------
create or replace function public.admin_admins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'email', u.email, 'name', coalesce(p.full_name, ''), 'since', r.created_at,
      'last_sign_in', u.last_sign_in_at, 'me', r.user_id = auth.uid(),
      'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = r.user_id and f.status = 'verified'))
    order by r.created_at)
    from public.user_roles r join auth.users u on u.id = r.user_id left join public.profiles p on p.id = r.user_id
    where r.role = 'admin'), '[]'::jsonb);
end $$;

create or replace function public.admin_grant_admin(_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.admin_guard();
  select id into uid from auth.users where lower(email) = lower(btrim(_email));
  if uid is null then raise exception 'Aucun compte avec cet e-mail. La personne doit d''abord créer un compte sur Amachia.'; end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin') on conflict do nothing;
end $$;

create or replace function public.admin_revoke_admin(_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _user = auth.uid() then raise exception 'Vous ne pouvez pas retirer vos propres droits.'; end if;
  delete from public.user_roles where user_id = _user and role = 'admin';
end $$;

-- Droits d'exécution : réservés aux comptes connectés, et chaque fonction vérifie le rôle admin.
do $$
declare f text;
begin
  foreach f in array array[
    'admin_kyc()', 'admin_set_kyc(uuid,text,text)', 'admin_settings()', 'admin_update_settings(jsonb)',
    'admin_save_zone(uuid,text,int,int,int,boolean)', 'admin_delete_zone(uuid)', 'admin_prime()',
    'admin_grant_prime(text,int)', 'admin_cancel_prime(uuid)', 'admin_admins()', 'admin_grant_admin(text)', 'admin_revoke_admin(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
