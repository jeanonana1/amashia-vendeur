-- Lien d'encaissement par QR code : l'admin connecté sur PC génère un lien temporaire (12 h) ;
-- le téléphone qui le scanne ouvre la page d'encaissement sans se reconnecter, avec les droits de cet admin,
-- limités à la fiche livreur (lecture) et à l'enregistrement des encaissements.
create table if not exists public.admin_cash_links (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours',
  revoked boolean not null default false
);
alter table public.admin_cash_links enable row level security;

create or replace function public.admin_guard(_fn text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); s public.admin_staff; secs text[]; lt text := nullif(current_setting('amashia.cash_link', true), '');
begin
  -- page d'encaissement ouverte par QR code : droits de l'admin qui a créé le lien, pour ces deux fonctions seulement
  if lt is not null then
    if _fn not in ('admin_courier_daily', 'admin_confirm_courier_cash') then raise exception 'Action non autorisée depuis le lien d''encaissement.' using errcode = '42501'; end if;
    select l.user_id into uid from public.admin_cash_links l where l.token = lt::uuid and not l.revoked and l.expires_at > now();
    if uid is null then raise exception 'Lien d''encaissement expiré : générez un nouveau QR code depuis l''admin.' using errcode = '42501'; end if;
  else
    if uid is null or not exists (select 1 from public.user_roles where user_id = uid and role = 'admin') then
      raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
    end if;
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception 'Double authentification requise : saisissez le code de votre application d''authentification.' using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.user_roles where user_id = uid and role = 'admin') then raise exception 'Accès réservé aux administrateurs.' using errcode = '42501'; end if;
  select * into s from public.admin_staff where user_id = uid;
  if s.user_id is null or s.status <> 'active' then raise exception 'Compte administrateur désactivé.' using errcode = '42501'; end if;
  if lt is null and greatest(coalesce(s.last_seen_at, '-infinity'),
       coalesce((select se.created_at from auth.sessions se where se.id = nullif(auth.jwt() ->> 'session_id', '')::uuid), '-infinity')) < now() - interval '1 hour' then
    raise exception 'Session verrouillée après 1 heure d''inactivité : reconnectez-vous.' using errcode = '42501';
  end if;
  if not s.is_super then
    select sections into secs from public.admin_fn_sections where fn = _fn;
    if secs is null then raise exception 'Action réservée aux super administrateurs.' using errcode = '42501'; end if;
    if not ('*' = any(secs) or secs && s.permissions) then raise exception 'Vous n''avez pas accès à cette section.' using errcode = '42501'; end if;
  end if;
  if _fn ~ '^admin_(save|set|delete|create|update|remove|invite|cancel|approve|reject|grant|revoke|toggle|mark|pay|refund|reset|send|suspend|assign|validate|accept|decide|process|resolve|reply|add|archive|restore|publish|block|unblock|verify|confirm|change|edit|upload|import|close|reopen|ban)(_|$)' then
    insert into public.admin_activity (user_id, kind, target, page, ip)
    values (uid, 'action', _fn, case when lt is not null then 'QR encaissement (téléphone)' else left(public.admin_req_header('x-amashia-page'), 200) end,
      split_part(coalesce(public.admin_req_header('x-forwarded-for'), ''), ',', 1));
  end if;
end $function$;

-- PC : création du lien (réservé à qui peut encaisser)
create or replace function public.admin_cash_link_create()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid; e timestamptz;
begin
  perform public.admin_guard('admin_confirm_courier_cash');
  delete from admin_cash_links where expires_at < now() - interval '1 day';
  insert into admin_cash_links (user_id) values (auth.uid()) returning token, expires_at into t, e;
  return jsonb_build_object('token', t, 'expires_at', e);
end $$;
insert into public.admin_fn_sections (fn, sections) values ('admin_cash_link_create', array['livreurs', 'finance'])
on conflict (fn) do update set sections = excluded.sections;

-- Téléphone : informations du lien
create or replace function public.cash_link_info(_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l admin_cash_links;
begin
  select * into l from admin_cash_links where token = _token;
  if l.token is null or l.revoked or l.expires_at <= now() then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'expires_at', l.expires_at, 'by', (select full_name from admin_staff where user_id = l.user_id));
end $$;

create or replace function public.cash_link_sheet(_token uuid, _code text, _day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform set_config('amashia.cash_link', _token::text, true);
  return public.admin_courier_sheet(_code, _day);
end $$;

create or replace function public.cash_link_confirm(_token uuid, _courier uuid, _day date, _amount integer, _method text default 'cash', _ref text default null, _note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform set_config('amashia.cash_link', _token::text, true);
  return public.admin_confirm_courier_cash(_courier, _day, _amount, _method, _ref, _note);
end $$;

revoke all on function public.cash_link_info(uuid), public.cash_link_sheet(uuid, text, date), public.cash_link_confirm(uuid, uuid, date, integer, text, text, text) from public;
grant execute on function public.cash_link_info(uuid), public.cash_link_sheet(uuid, text, date), public.cash_link_confirm(uuid, uuid, date, integer, text, text, text) to anon, authenticated;
