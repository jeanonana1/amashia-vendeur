-- Amachia — Admin, étape 9 : personnalisation du site client (logo, menu, couleurs) et pages de contenu modifiables.

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  texts jsonb not null default '{}'::jsonb,
  images jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_settings enable row level security;
alter table public.site_pages enable row level security;

-- Lecture publique (site client)
create or replace function public.site_theme() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from site_settings where key = 'theme'), '{}'::jsonb)
$$;
create or replace function public.site_page(_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('texts', texts, 'images', images, 'updated_at', updated_at) from site_pages where slug = _slug), '{}'::jsonb)
$$;
grant execute on function public.site_theme() to anon, authenticated;
grant execute on function public.site_page(text) to anon, authenticated;

-- Admin
create or replace function public.admin_site_theme() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_site_theme');
  return jsonb_build_object('theme', public.site_theme(),
    'updated_at', (select updated_at from site_settings where key = 'theme'),
    'updated_by', (select s.full_name from site_settings x join admin_staff s on s.user_id = x.updated_by where x.key = 'theme'));
end $$;
create or replace function public.admin_save_site_theme(_theme jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  perform public.admin_guard('admin_save_site_theme');
  -- couleurs : uniquement des codes hexadécimaux
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(_theme->'colors', '{}'::jsonb)) loop
    if v !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Couleur invalide pour « % » : %', k, v; end if;
  end loop;
  if jsonb_array_length(coalesce(_theme->'menu', '[]'::jsonb)) > 20 then raise exception 'Menu : 20 liens au maximum.'; end if;
  insert into site_settings (key, value, updated_at, updated_by) values ('theme', coalesce(_theme, '{}'::jsonb), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.admin_pages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_pages');
  return coalesce((select jsonb_object_agg(p.slug, jsonb_build_object('title', p.title, 'texts', p.texts, 'images', p.images, 'updated_at', p.updated_at,
    'changes', (select count(*) from jsonb_object_keys(p.texts)) + (select count(*) from jsonb_object_keys(p.images)),
    'updated_by', (select full_name from admin_staff s where s.user_id = p.updated_by))) from site_pages p), '{}'::jsonb);
end $$;
create or replace function public.admin_save_page(_slug text, _title text, _texts jsonb, _images jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_save_page');
  if _slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'Page inconnue.'; end if;
  insert into site_pages (slug, title, texts, images, updated_at, updated_by)
  values (_slug, coalesce(nullif(btrim(_title), ''), _slug), coalesce(_texts, '{}'::jsonb), coalesce(_images, '{}'::jsonb), now(), auth.uid())
  on conflict (slug) do update set title = excluded.title, texts = excluded.texts, images = excluded.images, updated_at = now(), updated_by = auth.uid();
end $$;
create or replace function public.admin_reset_page(_slug text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.admin_guard('admin_reset_page'); delete from site_pages where slug = _slug; end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_site_theme()', 'admin_save_site_theme(jsonb)', 'admin_pages()', 'admin_save_page(text,text,jsonb,jsonb)', 'admin_reset_page(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
