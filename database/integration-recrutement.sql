-- Recrutement : offres d'emploi publiées depuis l'admin, affichées sur la page Carrières,
-- candidatures avec CV (fichier ou lien). Additif et rejouable.

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  department text,
  contract_type text not null default 'CDI',
  city text,
  work_mode text not null default 'Sur site',
  positions int not null default 1 check (positions between 1 and 999),
  salary text,
  image_url text,
  summary text,
  missions text,
  requirements text,
  benefits text,
  deadline date,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.job_offers enable row level security;
drop policy if exists "offres publiees visibles" on public.job_offers;
create policy "offres publiees visibles" on public.job_offers for select to anon, authenticated
  using (status = 'published' and (deadline is null or deadline >= current_date));
grant select on public.job_offers to anon, authenticated;

alter table public.job_applications
  add column if not exists offer_id uuid references public.job_offers(id) on delete set null,
  add column if not exists cv_path text,
  add column if not exists cv_name text,
  add column if not exists district text,
  add column if not exists experience text,
  add column if not exists education text,
  add column if not exists availability text,
  add column if not exists licence text,
  add column if not exists languages text[],
  add column if not exists status text not null default 'new',
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.job_applications alter column area drop not null;
do $$ begin
  alter table public.job_applications add constraint job_applications_status_chk check (status in ('new','reviewing','interview','hired','rejected'));
exception when duplicate_object then null; end $$;

-- Contrôles à l'envoi : offre ouverte, CV présent pour une offre, champs propres, pas d'envoi en rafale.
create or replace function public.job_application_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'new'; new.admin_note := null; new.created_at := now(); new.updated_at := now();
  new.full_name := left(btrim(new.full_name), 120); new.email := lower(left(btrim(new.email), 200));
  if char_length(new.full_name) < 2 then raise exception 'Indiquez votre nom complet.'; end if;
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  if char_length(coalesce(new.message, '')) < 20 then raise exception 'Présentez-vous en quelques phrases (20 caractères minimum).'; end if;
  if new.link is not null and new.link !~* '^https?://' then raise exception 'Le lien du CV doit commencer par http:// ou https://'; end if;
  if new.cv_path is not null and new.cv_path !~ '^cv/[0-9a-f-]{36}/[^/]+$' then raise exception 'Fichier de CV invalide.'; end if;
  if new.offer_id is not null then
    if not exists (select 1 from job_offers o where o.id = new.offer_id and o.status = 'published' and (o.deadline is null or o.deadline >= current_date)) then
      raise exception 'Cette offre n''est plus ouverte aux candidatures.';
    end if;
    new.area := coalesce(nullif(new.area, ''), (select o.title from job_offers o where o.id = new.offer_id));
    if new.cv_path is null and nullif(btrim(coalesce(new.link, '')), '') is null then raise exception 'Ajoutez votre CV (fichier ou lien).'; end if;
    if exists (select 1 from job_applications a where a.offer_id = new.offer_id and a.email = new.email) then
      raise exception 'Vous avez déjà postulé à cette offre avec cette adresse e-mail.';
    end if;
  end if;
  if (select count(*) from job_applications a where a.email = new.email and a.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Trop de candidatures envoyées : réessayez plus tard.';
  end if;
  return new;
end $$;
drop trigger if exists job_application_guard on public.job_applications;
create trigger job_application_guard before insert on public.job_applications for each row execute function public.job_application_guard();

-- Stockage privé des CV (PDF, Word, images ; 5 Mo). Envoi possible sans compte, lecture réservée à l'équipe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-cvs', 'job-cvs', false, 5242880, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Candidats envoient un CV" on storage.objects;
create policy "Candidats envoient un CV" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'job-cvs' and (storage.foldername(name))[1] = 'cv');
drop policy if exists "Equipe lit les CV" on storage.objects;
create policy "Equipe lit les CV" on storage.objects for select to authenticated
  using (bucket_id = 'job-cvs' and public.staff_can('recrutement'));

-- Fonctions admin
insert into public.admin_fn_sections (fn, sections) values
  ('admin_job_offers', array['recrutement']), ('admin_save_job_offer', array['recrutement']),
  ('admin_delete_job_offer', array['recrutement']), ('admin_job_applications', array['recrutement']),
  ('admin_update_job_application', array['recrutement'])
on conflict (fn) do update set sections = excluded.sections;

create or replace function public.admin_job_offers() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_job_offers');
  return coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'applications', (select count(*) from job_applications a where a.offer_id = o.id),
      'new_applications', (select count(*) from job_applications a where a.offer_id = o.id and a.status = 'new'),
      'expired', o.deadline is not null and o.deadline < current_date)
    order by (o.status = 'published') desc, o.updated_at desc) from job_offers o), '[]'::jsonb);
end $$;

create or replace function public.admin_save_job_offer(_o jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid := nullif(_o->>'id', '')::uuid; _st text := coalesce(nullif(_o->>'status', ''), 'draft');
begin
  perform admin_guard('admin_save_job_offer');
  if _st not in ('draft','published','closed') then raise exception 'Statut invalide.'; end if;
  if char_length(btrim(coalesce(_o->>'title', ''))) < 3 then raise exception 'Indiquez l''intitulé du poste.'; end if;
  if _st = 'published' and char_length(btrim(coalesce(_o->>'summary', ''))) < 20 then raise exception 'Ajoutez une présentation du poste (20 caractères minimum) avant de publier.'; end if;
  if _id is null then
    insert into job_offers (title, created_by) values (btrim(_o->>'title'), auth.uid()) returning id into _id;
  end if;
  update job_offers set
    title = btrim(_o->>'title'), department = nullif(btrim(coalesce(_o->>'department', '')), ''),
    contract_type = coalesce(nullif(_o->>'contract_type', ''), 'CDI'), city = nullif(btrim(coalesce(_o->>'city', '')), ''),
    work_mode = coalesce(nullif(_o->>'work_mode', ''), 'Sur site'), positions = greatest(1, coalesce((_o->>'positions')::int, 1)),
    salary = nullif(btrim(coalesce(_o->>'salary', '')), ''), image_url = nullif(_o->>'image_url', ''),
    summary = nullif(btrim(coalesce(_o->>'summary', '')), ''), missions = nullif(btrim(coalesce(_o->>'missions', '')), ''),
    requirements = nullif(btrim(coalesce(_o->>'requirements', '')), ''), benefits = nullif(btrim(coalesce(_o->>'benefits', '')), ''),
    deadline = nullif(_o->>'deadline', '')::date, status = _st,
    published_at = case when _st = 'published' then coalesce(published_at, now()) else published_at end,
    updated_at = now()
  where id = _id;
  return _id;
end $$;

create or replace function public.admin_delete_job_offer(_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_delete_job_offer');
  delete from job_offers where id = _id;
end $$;

create or replace function public.admin_job_applications(_offer uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_job_applications');
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('offer_title', o.title) order by a.created_at desc)
    from job_applications a left join job_offers o on o.id = a.offer_id
    where _offer is null or a.offer_id = _offer), '[]'::jsonb);
end $$;

create or replace function public.admin_update_job_application(_id uuid, _status text, _note text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_update_job_application');
  if _status not in ('new','reviewing','interview','hired','rejected') then raise exception 'Statut invalide.'; end if;
  update job_applications set status = _status, admin_note = nullif(btrim(coalesce(_note, '')), ''), updated_at = now() where id = _id;
end $$;

revoke all on function public.admin_job_offers(), public.admin_save_job_offer(jsonb), public.admin_delete_job_offer(uuid),
  public.admin_job_applications(uuid), public.admin_update_job_application(uuid, text, text) from public, anon;
grant execute on function public.admin_job_offers(), public.admin_save_job_offer(jsonb), public.admin_delete_job_offer(uuid),
  public.admin_job_applications(uuid), public.admin_update_job_application(uuid, text, text) to authenticated;

-- Temps réel : la page Carrières se met à jour dès la publication.
do $$ begin alter publication supabase_realtime add table public.job_offers; exception when duplicate_object then null; end $$;
