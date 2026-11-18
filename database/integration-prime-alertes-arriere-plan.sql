-- Prime : alertes de nouvelles commandes même quand l'application est fermée.
-- Le téléphone du livreur garde un service Android « Prime en ligne » qui interroge la base toutes les ~10 s
-- avec une clé d'appareil (créée à la connexion, révocable), sans dépendre de la session de l'application.

create table if not exists public.courier_devices (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  key_hash text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  last_poll_at timestamptz
);
alter table public.courier_devices enable row level security;
revoke all on public.courier_devices from anon, authenticated;

-- appelé par l'application (livreur connecté) : renvoie une nouvelle clé pour ce téléphone
create or replace function public.courier_device_register(_platform text default 'android') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c couriers := current_courier(); k text;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  k := encode(extensions.gen_random_bytes(32), 'hex');
  insert into courier_devices (courier_id, key_hash, platform) values (c.id, encode(extensions.digest(k, 'sha256'), 'hex'), left(_platform, 20));
  -- au plus 3 téléphones par livreur
  delete from courier_devices where courier_id = c.id and id not in (select id from courier_devices where courier_id = c.id order by created_at desc limit 3);
  return k;
end $$;
revoke all on function public.courier_device_register(text) from public, anon;
grant execute on function public.courier_device_register(text) to authenticated;

-- déconnexion : la clé du téléphone est supprimée
create or replace function public.courier_device_forget(_key text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from courier_devices where key_hash = encode(extensions.digest(_key, 'sha256'), 'hex');
$$;
grant execute on function public.courier_device_forget(text) to anon, authenticated;

-- appelé par le service Android : position + commandes proposées à ce livreur
create or replace function public.courier_poll(_key text, _lat double precision default null, _lng double precision default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare dev courier_devices; c couriers; reqs jsonb;
begin
  select * into dev from courier_devices where key_hash = encode(extensions.digest(coalesce(_key, ''), 'sha256'), 'hex');
  if dev.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown_device'); end if;
  select * into c from couriers where id = dev.courier_id;
  if c.id is null or c.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  update courier_devices set last_poll_at = now() where id = dev.id;
  if _lat is not null and _lng is not null then
    update couriers set last_lat = _lat, last_lng = _lng, last_loc_at = now(), last_seen_at = now() where id = c.id;
  else
    update couriers set last_seen_at = now() where id = c.id;
  end if;
  if c.availability = 'offline' then return jsonb_build_object('ok', true, 'online', false, 'requests', '[]'::jsonb); end if;
  -- même liste que dans l'application (vagues de proximité comprises)
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_id, 'role', 'authenticated')::text, true);
  reqs := courier_requests();
  return jsonb_build_object('ok', true, 'online', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('id', r->>'order_id', 'number', r->>'order_number',
      'title', '📦 Nouvelle course près de vous',
      'body', concat_ws(' · ', r->'pickup'->>'name', nullif(concat_ws(', ', r->>'district', r->>'city'), ''),
        case when (r->>'to_collect')::int > 0 then replace(to_char((r->>'to_collect')::int, 'FM999G999G999'), ',', ' ') || ' FCFA à encaisser' else 'déjà payé' end)))
    from jsonb_array_elements(reqs) r), '[]'::jsonb));
end $$;
revoke all on function public.courier_poll(text, double precision, double precision) from public;
grant execute on function public.courier_poll(text, double precision, double precision) to anon, authenticated;
