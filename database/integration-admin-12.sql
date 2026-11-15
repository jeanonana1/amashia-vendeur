-- Amashia — Admin, étape 12 : quartiers des villes du Cameroun (zones de livraison)
-- Liste de référence (recherche en ligne) + quartiers ajoutés par l'équipe admin.
create table if not exists public.cm_districts (
  id bigserial primary key,
  region text not null,
  city text not null,
  name text not null,
  source text not null default 'admin',   -- 'reference' (recherche en ligne) ou 'admin' (ajouté dans l'admin)
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists cm_districts_uniq on public.cm_districts (lower(city), lower(name));
alter table public.cm_districts enable row level security;
drop policy if exists "Quartiers lisibles par tous" on public.cm_districts;
create policy "Quartiers lisibles par tous" on public.cm_districts for select to anon, authenticated using (true);
grant select on public.cm_districts to anon, authenticated;

create or replace function public.admin_districts(_city text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_districts');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'source', source, 'note', note) order by name)
    from cm_districts where lower(city) = lower(_city)), '[]'::jsonb);
end $$;

create or replace function public.admin_add_district(_region text, _city text, _name text, _note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')); r cm_districts;
begin
  perform public.admin_guard('admin_add_district');
  if length(n) < 2 or length(n) > 60 then raise exception 'Nom de quartier invalide.'; end if;
  if coalesce(btrim(_city), '') = '' then raise exception 'Choisissez d''abord la ville.'; end if;
  select * into r from cm_districts where lower(city) = lower(_city) and lower(name) = lower(n);
  if r.id is null then
    insert into cm_districts (region, city, name, source, note, created_by) values (coalesce(nullif(btrim(_region), ''), '—'), btrim(_city), n, 'admin', nullif(btrim(_note), ''), auth.uid()) returning * into r;
  end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'source', r.source, 'note', r.note);
end $$;
insert into public.admin_fn_sections (fn, sections) values ('admin_districts', '{livraison,livreurs}'), ('admin_add_district', '{livraison,livreurs}')
on conflict (fn) do update set sections = excluded.sections;
