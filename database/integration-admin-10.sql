-- Amashia — Admin, étape 10 :
--   1. Commissions : interrupteur général (protégé par mot de passe), commission appliquée aux anciennes commandes
--   2. Vendeurs : plus aucun accès direct au téléphone, à l'e-mail ni à l'adresse détaillée des clients
--   3. Rapport d'activité des membres de l'équipe (pages visitées, actions)
--   4. Messages : « Tous les visiteurs » et « Nouveaux visiteurs » (sans compte), statistiques d'affichage, modification
-- Le mot de passe de confirmation n'est jamais écrit ici : il est enregistré à part, chiffré (bcrypt).

-- 1. Commissions ----------------------------------------------------------------------------------------
create table if not exists public.admin_secrets (
  key text primary key,
  hash text not null,
  failed int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_secrets enable row level security; -- aucune lecture directe

insert into public.site_settings (key, value) values ('commissions', '{"enabled": true}'::jsonb) on conflict (key) do nothing;

create or replace function public.commissions_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean from site_settings where key = 'commissions'), true)
$$;

-- Nouvelles commandes : taux de la catégorie, ou 0 si les commissions sont désactivées
create or replace function public.trg_item_commission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.commissions_enabled() then new.commission_pct := 0; return new; end if;
  select coalesce(c.commission_pct, 0) into new.commission_pct
  from public.products p join public.categories c on c.slug = p.category_slug where p.id = new.product_id;
  new.commission_pct := coalesce(new.commission_pct, 0);
  return new;
end $$;

-- Vérifie le mot de passe de confirmation (5 essais, puis blocage de 15 minutes)
create or replace function public.admin_check_secret(_key text, _password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s admin_secrets;
begin
  select * into s from admin_secrets where key = _key for update;
  if s.key is null then raise exception 'Mot de passe de confirmation non configuré.'; end if;
  if s.locked_until is not null and s.locked_until > now() then
    raise exception 'Trop d''essais incorrects. Réessayez après %.', to_char(s.locked_until at time zone 'Africa/Douala', 'HH24:MI');
  end if;
  if coalesce(_password, '') = '' or extensions.crypt(_password, s.hash) <> s.hash then
    update admin_secrets set
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end,
      failed = case when failed + 1 >= 5 then 0 else failed + 1 end where key = _key;
    insert into admin_activity (user_id, kind, target, label) values (auth.uid(), 'denied', _key, 'Mot de passe de confirmation incorrect');
    -- l'échec doit être conservé : on ne lève pas d'exception ici
    return;
  end if;
  update admin_secrets set failed = 0, locked_until = null where key = _key;
  perform set_config('amashia.secret_ok', _key, true);
end $$;
revoke execute on function public.admin_check_secret(text, text) from public, anon, authenticated;

create or replace function public.admin_commission_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_commission_settings');
  return (select jsonb_build_object('enabled', public.commissions_enabled(), 'updated_at', st.updated_at,
      'updated_by', (select full_name from admin_staff where user_id = st.updated_by),
      'password_set', exists (select 1 from admin_secrets where key = 'commissions'))
    from (select * from site_settings where key = 'commissions') st);
end $$;

-- Renvoie { ok, error } : un mauvais mot de passe ne lève pas d'erreur, pour que l'essai soit compté
create or replace function public.admin_set_commissions_enabled(_enabled boolean, _password text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_set_commissions_enabled');
  perform set_config('amashia.secret_ok', '', true);
  perform public.admin_check_secret('commissions', _password);
  if current_setting('amashia.secret_ok', true) is distinct from 'commissions' then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe incorrect.');
  end if;
  update site_settings set value = jsonb_build_object('enabled', _enabled), updated_at = now(), updated_by = auth.uid() where key = 'commissions';
  return jsonb_build_object('ok', true, 'enabled', _enabled);
end $$;

-- Commission appliquée aussi aux commandes passées avant sa mise en place (demande de l'administrateur)
update public.order_items oi set commission_pct = c.commission_pct
from public.products p join public.categories c on c.slug = p.category_slug
where p.id = oi.product_id and oi.commission_pct = 0 and coalesce(c.commission_pct, 0) > 0;

-- Taux par catégorie : mot de passe exigé aussi
drop function if exists public.admin_save_category(uuid, text, text, text, int, numeric);
drop function if exists public.admin_set_commission(uuid, numeric);
create or replace function public.admin_set_commission(_category uuid, _pct numeric, _password text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_set_commission');
  if _pct is null or _pct < 0 or _pct > 60 then raise exception 'Taux invalide (0 à 60 %%).'; end if;
  perform set_config('amashia.secret_ok', '', true);
  perform public.admin_check_secret('commissions', _password);
  if current_setting('amashia.secret_ok', true) is distinct from 'commissions' then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe incorrect.');
  end if;
  update categories set commission_pct = round(_pct, 2) where id = _category;
  return jsonb_build_object('ok', true);
end $$;
insert into public.admin_fn_sections (fn, sections) values
  ('admin_commission_settings', '{finance}'), ('admin_set_commissions_enabled', '{finance}'), ('admin_set_commission', '{finance}')
on conflict (fn) do update set sections = excluded.sections;

-- Espace vendeur : indique si les commissions sont actives
do $$ declare def text; begin
  def := pg_get_functiondef('public.seller_commissions'::regproc);
  if position('''enabled''' in def) = 0 then
    def := replace(def, $x$'balance', public.seller_available_balance(sid),$x$, $x$'balance', public.seller_available_balance(sid), 'enabled', public.commissions_enabled(),$x$);
    execute def;
  end if;
end $$;

-- 2. Vendeurs : plus de lecture directe des commandes (téléphone, e-mail, adresse détaillée).
-- Ils passent uniquement par la vue seller_orders et les fonctions vendeur, qui ne donnent que le nom et le quartier.
drop policy if exists "Sellers view orders containing their items" on public.orders;

-- 3. Rapport d'activité de l'équipe ---------------------------------------------------------------------
create table if not exists public.admin_activity (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('page', 'action', 'denied')),
  target text not null,          -- chemin de la page ou nom de l'action
  label text,                    -- titre de la page
  page text,                     -- page d'où l'action a été faite
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_user_idx on public.admin_activity (user_id, created_at desc);
alter table public.admin_activity enable row level security; -- lecture via les fonctions de rapport uniquement

create or replace function public.admin_req_header(_name text) returns text
language plpgsql stable as $$
declare h jsonb;
begin
  begin h := current_setting('request.headers', true)::jsonb; exception when others then return null; end;
  return h ->> _name;
end $$;

-- La garde enregistre maintenant chaque action (modification) faite dans l'admin
create or replace function public.admin_guard(_fn text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
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
  if not s.is_super then
    select sections into secs from public.admin_fn_sections where fn = _fn;
    if secs is null then raise exception 'Action réservée aux super administrateurs.' using errcode = '42501'; end if;
    if not ('*' = any(secs) or secs && s.permissions) then raise exception 'Vous n''avez pas accès à cette section.' using errcode = '42501'; end if;
  end if;
  if _fn ~ '^admin_(save|set|delete|create|update|remove|invite|cancel|approve|reject|grant|revoke|toggle|mark|pay|refund|reset|send|suspend|assign|validate|accept|decide|process|resolve|reply|add|archive|restore|publish|block|unblock|verify|confirm|change|edit|upload|import|close|reopen|ban)(_|$)' then
    insert into public.admin_activity (user_id, kind, target, page, ip)
    values (uid, 'action', _fn, left(public.admin_req_header('x-amashia-page'), 200),
      split_part(coalesce(public.admin_req_header('x-forwarded-for'), ''), ',', 1));
  end if;
end $$;

-- Page visitée (appelée par l'admin à chaque changement de page)
create or replace function public.admin_log_page(_path text, _title text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
     or not exists (select 1 from admin_staff where user_id = uid and status = 'active') then return; end if;
  if exists (select 1 from admin_activity where user_id = uid and kind = 'page' and target = left(_path, 200) and created_at > now() - interval '20 seconds') then return; end if;
  insert into admin_activity (user_id, kind, target, label, ip)
  values (uid, 'page', left(_path, 200), left(_title, 120), split_part(coalesce(public.admin_req_header('x-forwarded-for'), ''), ',', 1));
end $$;
revoke execute on function public.admin_log_page(text, text) from public, anon;
grant execute on function public.admin_log_page(text, text) to authenticated;

-- Liste des membres avec un résumé de leur activité (super administrateurs)
create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_reports');
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'full_name', s.full_name, 'email', s.email, 'job_title', s.job_title,
      'is_super', s.is_super, 'status', s.status, 'me', s.user_id = auth.uid(), 'created_at', s.created_at,
      'pages_7d', (select count(*) from admin_activity a where a.user_id = s.user_id and a.kind = 'page' and a.created_at > now() - interval '7 days'),
      'actions_7d', (select count(*) from admin_activity a where a.user_id = s.user_id and a.kind = 'action' and a.created_at > now() - interval '7 days'),
      'denied_7d', (select count(*) from admin_activity a where a.user_id = s.user_id and a.kind = 'denied' and a.created_at > now() - interval '7 days'),
      'last_activity', (select max(created_at) from admin_activity a where a.user_id = s.user_id),
      'last_login', (select max(created_at) from admin_login_log l where l.user_id = s.user_id),
      'logins_30d', (select count(*) from admin_login_log l where l.user_id = s.user_id and l.created_at > now() - interval '30 days'))
    order by s.is_super, s.full_name) from admin_staff s), '[]'::jsonb);
end $$;

-- Rapport complet d'un membre sur une période
create or replace function public.admin_report_user(_user uuid, _from timestamptz, _to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_report_user');
  return jsonb_build_object(
    'member', (select jsonb_build_object('user_id', s.user_id, 'full_name', s.full_name, 'email', s.email, 'phone', s.phone, 'job_title', s.job_title,
        'is_super', s.is_super, 'permissions', to_jsonb(s.permissions), 'status', s.status, 'created_at', s.created_at) from admin_staff s where s.user_id = _user),
    'events', coalesce((select jsonb_agg(e order by (e->>'at') desc) from (
        select x.e from (
          select jsonb_build_object('kind', a.kind, 'target', a.target, 'label', a.label, 'page', a.page, 'ip', a.ip, 'at', a.created_at) e, a.created_at ts
          from admin_activity a where a.user_id = _user and a.created_at >= _from and a.created_at < _to
          union all
          select jsonb_build_object('kind', 'login', 'target', 'login', 'ip', l.ip, 'ua', l.user_agent, 'at', l.created_at), l.created_at
          from admin_login_log l where l.user_id = _user and l.created_at >= _from and l.created_at < _to) x
        order by x.ts desc limit 2000) z), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('path', target, 'title', title, 'visits', n) order by n desc) from (
        select target, max(label) title, count(*) n from admin_activity
        where user_id = _user and kind = 'page' and created_at >= _from and created_at < _to group by target order by n desc limit 15) t), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'pages', p, 'actions', ac, 'first', f, 'last', l) order by d desc) from (
        select (created_at at time zone 'Africa/Douala')::date d, count(*) filter (where kind = 'page') p, count(*) filter (where kind = 'action') ac,
          min(created_at) f, max(created_at) l
        from admin_activity where user_id = _user and created_at >= _from and created_at < _to group by 1) t), '[]'::jsonb));
end $$;

-- 4. Messages aux visiteurs -----------------------------------------------------------------------------
alter table public.customer_messages drop constraint if exists customer_messages_audience_check;
alter table public.customer_messages add constraint customer_messages_audience_check
  check (audience in ('all', 'prime', 'buyers', 'user', 'visitors', 'new_visitors'));
alter table public.customer_messages add column if not exists views int not null default 0;

-- Messages visibles par tout visiteur, connecté ou non (le navigateur retient ceux déjà vus)
create or replace function public.visitor_messages(_new boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'body', m.body, 'image_url', m.image_url,
      'link_url', m.link_url, 'link_label', m.link_label, 'audience', m.audience) order by m.created_at), '[]'::jsonb)
  from public.customer_messages m
  where m.is_active and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
    and (m.audience = 'visitors' or (m.audience = 'new_visitors' and coalesce(_new, false)))
$$;
create or replace function public.message_viewed(_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.customer_messages set views = views + 1 where id = _id and is_active
$$;
grant execute on function public.visitor_messages(boolean) to anon, authenticated;
grant execute on function public.message_viewed(uuid) to anon, authenticated;

create or replace function public.admin_messages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_messages');
  return jsonb_build_object(
    'messages', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('reads', (select count(*) from customer_message_reads r where r.message_id = m.id),
        'target_email', (select email from auth.users u where u.id = m.user_id)) order by m.created_at desc) from customer_messages m), '[]'::jsonb),
    'audience', jsonb_build_object('all', (select count(*) from profiles), 'prime', (select count(distinct user_id) from prime_subscriptions where is_active and expires_at > now()),
      'buyers', (select count(distinct user_id) from orders where status <> 'Annulée')));
end $$;

create or replace function public.admin_save_message(_m jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; mid uuid := nullif(_m->>'id', '')::uuid; aud text := coalesce(nullif(_m->>'audience', ''), 'all');
begin
  perform public.admin_guard('admin_save_message');
  if mid is not null and not (_m ? 'title') then
    update customer_messages set is_active = coalesce((_m->>'is_active')::boolean, is_active) where id = mid; return;
  end if;
  if coalesce(btrim(_m->>'title'), '') = '' or coalesce(btrim(_m->>'body'), '') = '' then raise exception 'Indiquez le titre et le message.'; end if;
  if aud not in ('all', 'prime', 'buyers', 'user', 'visitors', 'new_visitors') then raise exception 'Destinataires invalides.'; end if;
  if aud = 'user' then
    select id into uid from auth.users where lower(email) = lower(btrim(_m->>'email'));
    if uid is null then raise exception 'Aucun compte client avec cet e-mail.'; end if;
  end if;
  if mid is not null then
    update customer_messages set title = btrim(_m->>'title'), body = btrim(_m->>'body'), image_url = nullif(_m->>'image_url', ''),
      link_url = nullif(btrim(_m->>'link_url'), ''), link_label = nullif(btrim(_m->>'link_label'), ''), audience = aud, user_id = uid,
      ends_at = nullif(_m->>'ends_at', '')::timestamptz where id = mid;
    return;
  end if;
  insert into customer_messages (title, body, image_url, link_url, link_label, audience, user_id, starts_at, ends_at)
  values (btrim(_m->>'title'), btrim(_m->>'body'), nullif(_m->>'image_url', ''), nullif(btrim(_m->>'link_url'), ''), nullif(btrim(_m->>'link_label'), ''),
    aud, uid, coalesce(nullif(_m->>'starts_at', '')::timestamptz, now()), nullif(_m->>'ends_at', '')::timestamptz);
end $$;

-- Aperçu d'un message sur le vrai site, depuis l'admin (lien ?apercu_message=…)
create or replace function public.message_preview(_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id, 'title', m.title, 'body', m.body, 'image_url', m.image_url, 'link_url', m.link_url, 'link_label', m.link_label)
  from public.customer_messages m where m.id = _id
$$;
grant execute on function public.message_preview(uuid) to anon, authenticated;
