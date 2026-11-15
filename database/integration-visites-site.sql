-- Visites du site client (une visite = une session de navigation, 30 min d'inactivité max), avec la ville
-- déduite de l'adresse IP par l'hébergeur. Sert à la page « Activité temps réel » de l'admin.
create table if not exists public.site_visits (
  id bigserial primary key,
  visitor_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  city text,
  region text,
  country text,
  first_path text,
  last_path text,
  pages int not null default 1,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists site_visits_time_idx on public.site_visits (started_at desc);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor_id, last_seen_at desc);
alter table public.site_visits enable row level security; -- aucun accès direct

-- Enregistre une page vue : prolonge la visite en cours, ou en ouvre une nouvelle après 30 min
create or replace function public.track_site_visit(_visitor text, _path text, _city text, _region text, _country text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := left(btrim(coalesce(_visitor, '')), 64); vid bigint;
begin
  if v !~ '^[A-Za-z0-9-]{16,64}$' then return; end if;
  if coalesce(_path, '') ~ '[?&]cms=' then return; end if;
  select id into vid from site_visits where visitor_id = v and last_seen_at > now() - interval '30 minutes' order by last_seen_at desc limit 1;
  if vid is not null then
    update site_visits set last_seen_at = now(), last_path = left(_path, 200), pages = pages + 1, user_id = coalesce(user_id, auth.uid()),
      city = coalesce(city, nullif(left(_city, 80), '')) where id = vid;
  else
    insert into site_visits (visitor_id, user_id, city, region, country, first_path, last_path)
    values (v, auth.uid(), nullif(left(_city, 80), ''), nullif(left(_region, 80), ''), nullif(left(_country, 8), ''), left(_path, 200), left(_path, 200));
  end if;
end $$;
grant execute on function public.track_site_visit(text, text, text, text, text) to anon, authenticated;

-- Statistiques par ville (heure du Cameroun)
create or replace function public.admin_site_visits(_from timestamptz, _to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_site_visits');
  return (with v as (
      select *, coalesce(city, 'Ville inconnue') c, extract(hour from started_at at time zone 'Africa/Douala')::int h
      from site_visits where started_at >= _from and started_at < _to)
    select jsonb_build_object(
      'totals', jsonb_build_object('visits', (select count(*) from v), 'visitors', (select count(distinct visitor_id) from v),
        'cities', (select count(distinct c) from v), 'pages', (select coalesce(sum(pages), 0) from v),
        'signed_in', (select count(*) from v where user_id is not null)),
      'by_city', coalesce((select jsonb_agg(jsonb_build_object('city', c, 'visits', n, 'visitors', u, 'pages', p, 'peak_hour', ph, 'hours', hrs) order by n desc) from (
          select c, count(*) n, count(distinct visitor_id) u, sum(pages) p,
            (select h from v v2 where v2.c = v.c group by h order by count(*) desc, h limit 1) ph,
            (select jsonb_agg(coalesce(x.cnt, 0) order by g) from generate_series(0, 23) g
               left join (select h hh, count(*) cnt from v v3 where v3.c = v.c group by h) x on x.hh = g) hrs
          from v group by c order by count(*) desc limit 30) t), '[]'::jsonb),
      'hours', (select jsonb_agg(coalesce(x.cnt, 0) order by g) from generate_series(0, 23) g left join (select h, count(*) cnt from v group by h) x on x.h = g),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('city', c, 'region', region, 'at', started_at, 'last_seen', last_seen_at, 'pages', pages,
          'path', first_path, 'last_path', last_path, 'member', user_id is not null) order by started_at desc) from (select * from v order by started_at desc limit 60) r), '[]'::jsonb)));
end $$;
insert into public.admin_fn_sections (fn, sections) values ('admin_site_visits', '{activite,analytics}')
on conflict (fn) do update set sections = excluded.sections;
