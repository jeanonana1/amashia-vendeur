-- Livraison : Amachia livre elle-même à Yaoundé et Douala (30 min à 4 h) ; ailleurs, le colis part par une agence
-- d'expédition choisie par le client. Les frais de l'agence vont à l'agence (pas à Amachia).
-- Les quartiers peuvent avoir leur propre prix de livraison.

-- 1. Villes et régions du Cameroun (référence commune admin / client)
create table if not exists public.cm_cities (city text primary key, region text not null);
alter table public.cm_cities enable row level security;
drop policy if exists "Villes lisibles par tous" on public.cm_cities;
create policy "Villes lisibles par tous" on public.cm_cities for select to anon, authenticated using (true);
grant select on public.cm_cities to anon, authenticated;
create or replace function public.cm_region_of(_city text) returns text language sql stable as $$
  select region from public.cm_cities where lower(city) = lower(btrim(coalesce(_city, ''))) limit 1
$$;
create or replace function public.is_local_city(_city text) returns boolean language sql immutable as $$
  select lower(translate(btrim(coalesce(_city, '')), 'éÉ', 'eE')) in ('yaounde', 'douala')
$$;

-- 2. Quartiers : prix de livraison propre, activation
alter table public.cm_districts add column if not exists fee integer check (fee is null or fee >= 0);
alter table public.cm_districts add column if not exists is_active boolean not null default true;
alter table public.cm_districts add column if not exists updated_at timestamptz not null default now();

-- 3. Agences d'expédition
create table if not exists public.shipping_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  regions text[] not null default '{}',     -- régions desservies
  cities text[] not null default '{}',      -- villes précises (vide = toute la région)
  fee integer not null default 0 check (fee >= 0),
  delay_text text,                          -- ex. « 24 à 72 h »
  notes text,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shipping_agencies enable row level security;
drop policy if exists "Agences actives lisibles" on public.shipping_agencies;
create policy "Agences actives lisibles" on public.shipping_agencies for select to anon, authenticated using (is_active);
grant select on public.shipping_agencies to anon, authenticated;

alter table public.orders add column if not exists shipping_mode text;          -- 'amashia' ou 'agency'
alter table public.orders add column if not exists shipping_agency_id uuid references public.shipping_agencies(id) on delete set null;
alter table public.orders add column if not exists shipping_agency_name text;

-- 4. Devis de livraison complet
create or replace function public.delivery_quote_v2(_city text, _subtotal integer, _district text default null, _agency uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.platform_settings; z public.delivery_zones; d public.cm_districts; a public.shipping_agencies;
  fee int; thr int; prime boolean := false; reg text := public.cm_region_of(_city); ags jsonb;
begin
  select * into s from platform_settings where id = 1;
  if public.is_local_city(_city) then
    select * into z from delivery_zones where is_active and lower(btrim(city)) = lower(btrim(coalesce(_city, ''))) limit 1;
    select * into d from cm_districts where is_active and lower(city) = lower(btrim(coalesce(_city, ''))) and lower(name) = lower(btrim(coalesce(_district, ''))) limit 1;
    fee := coalesce(d.fee, z.fee, s.shipping_fee);
    thr := coalesce(z.free_threshold, s.free_shipping_threshold);
    if auth.uid() is not null and s.prime_free_shipping then prime := public.prime_active(auth.uid()); end if;
    return jsonb_build_object('mode', 'amashia', 'fee', case when prime or (thr > 0 and coalesce(_subtotal, 0) > thr) then 0 else fee end,
      'base_fee', fee, 'district_fee', d.fee, 'free_threshold', thr, 'prime', prime, 'zone', z.city, 'region', reg,
      'delay_label', 'Entre 30 min et 4 h', 'days', 0);
  end if;
  -- hors Yaoundé / Douala : expédition par une agence partenaire
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone, 'address', x.address, 'fee', x.fee, 'delay', x.delay_text, 'notes', x.notes) order by x.sort, x.fee, x.name), '[]'::jsonb)
    into ags from shipping_agencies x
    where x.is_active and reg is not null and reg = any(x.regions)
      and (cardinality(x.cities) = 0 or lower(btrim(coalesce(_city, ''))) = any(select lower(c) from unnest(x.cities) c));
  if _agency is not null then
    select * into a from shipping_agencies x where x.id = _agency and x.is_active and reg = any(x.regions)
      and (cardinality(x.cities) = 0 or lower(btrim(coalesce(_city, ''))) = any(select lower(c) from unnest(x.cities) c));
  end if;
  return jsonb_build_object('mode', 'agency', 'region', reg, 'agencies', ags, 'agency', case when a.id is null then null else jsonb_build_object('id', a.id, 'name', a.name, 'fee', a.fee, 'delay', a.delay_text) end,
    'fee', coalesce(a.fee, 0), 'base_fee', coalesce(a.fee, 0), 'prime', false, 'free_threshold', 0,
    'delay_label', 'Selon l''agence d''expédition choisie', 'days', null);
end $$;
grant execute on function public.delivery_quote_v2(text, integer, text, uuid) to anon, authenticated;

-- L'ancien devis reste disponible (ville seule)
create or replace function public.delivery_quote(_city text, _subtotal integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.delivery_quote_v2(_city, _subtotal, null, null) || jsonb_build_object('days', coalesce((public.delivery_quote_v2(_city, _subtotal, null, null)->>'days')::int, (select delivery_days from platform_settings where id = 1)))
$$;

-- 5. Paiement : frais selon le quartier (Yaoundé / Douala) ou l'agence choisie (ailleurs)
do $$ declare def text; begin
  def := pg_get_functiondef('public.customer_checkout'::regproc);
  if position('delivery_quote_v2' in def) = 0 then
    def := replace(def, $x$fee:=(public.delivery_quote(p_details->>'city',sub)->>'fee')::int;$x$,
      $x$q2:=public.delivery_quote_v2(p_details->>'city',sub,p_details->>'district',nullif(p_details->>'agencyId','')::uuid);
 IF q2->>'mode'='agency' AND jsonb_array_length(coalesce(q2->'agencies','[]'::jsonb))>0 AND jsonb_typeof(q2->'agency') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choisissez l''agence d''expédition'; END IF;
 fee:=(q2->>'fee')::int;
 UPDATE public.orders SET shipping_mode=q2->>'mode', shipping_agency_id=nullif(q2->'agency'->>'id','')::uuid, shipping_agency_name=q2->'agency'->>'name' WHERE id=oid;$x$);
    def := replace(def, 'DECLARE bal integer;', 'DECLARE q2 jsonb; bal integer;');
    if position('delivery_quote_v2' in def) = 0 or position('q2 jsonb' in def) = 0 then raise exception 'customer_checkout : emplacement introuvable'; end if;
    execute def;
  end if;
end $$;

-- 6. Admin : agences
create or replace function public.admin_agencies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_agencies');
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('orders', (select count(*) from orders o where o.shipping_agency_id = a.id and o.status <> 'Annulée'),
      'fees_total', (select coalesce(sum(o.shipping_fee_fcfa), 0) from orders o where o.shipping_agency_id = a.id and o.status <> 'Annulée')) order by a.sort, a.name)
    from shipping_agencies a), '[]'::jsonb);
end $$;
create or replace function public.admin_save_agency(_a jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid := nullif(_a->>'id', '')::uuid; regs text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'regions', '[]'))), '{}');
  cts text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'cities', '[]'))), '{}');
begin
  perform public.admin_guard('admin_save_agency');
  if coalesce(btrim(_a->>'name'), '') = '' then raise exception 'Indiquez le nom de l''agence.'; end if;
  if cardinality(regs) = 0 then raise exception 'Choisissez au moins une région desservie.'; end if;
  if coalesce((_a->>'fee')::int, -1) < 0 then raise exception 'Indiquez les frais d''expédition.'; end if;
  if rid is null then
    insert into shipping_agencies (name, phone, address, regions, cities, fee, delay_text, notes, is_active)
    values (btrim(_a->>'name'), nullif(btrim(_a->>'phone'), ''), nullif(btrim(_a->>'address'), ''), regs, cts, (_a->>'fee')::int,
      nullif(btrim(_a->>'delay_text'), ''), nullif(btrim(_a->>'notes'), ''), coalesce((_a->>'is_active')::boolean, true)) returning id into rid;
  else
    update shipping_agencies set name = btrim(_a->>'name'), phone = nullif(btrim(_a->>'phone'), ''), address = nullif(btrim(_a->>'address'), ''),
      regions = regs, cities = cts, fee = (_a->>'fee')::int, delay_text = nullif(btrim(_a->>'delay_text'), ''), notes = nullif(btrim(_a->>'notes'), ''),
      is_active = coalesce((_a->>'is_active')::boolean, is_active), updated_at = now() where id = rid;
  end if;
  return rid;
end $$;
create or replace function public.admin_delete_agency(_id uuid) returns void
language plpgsql security definer set search_path = public as $$ begin perform public.admin_guard('admin_delete_agency'); delete from shipping_agencies where id = _id; end $$;

-- 7. Admin : quartiers (liste, modification, suppression)
create or replace function public.admin_districts(_city text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_districts');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'source', source, 'note', note, 'fee', fee, 'is_active', is_active, 'region', region, 'city', city) order by name)
    from cm_districts where (_city is null or lower(city) = lower(_city))), '[]'::jsonb);
end $$;
create or replace function public.admin_update_district(_id bigint, _name text, _fee integer, _note text, _active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text := btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')); d cm_districts;
begin
  perform public.admin_guard('admin_update_district');
  select * into d from cm_districts where id = _id;
  if d.id is null then raise exception 'Quartier introuvable.'; end if;
  if length(n) < 2 or length(n) > 60 then raise exception 'Nom de quartier invalide.'; end if;
  if exists (select 1 from cm_districts where id <> _id and lower(city) = lower(d.city) and lower(name) = lower(n)) then raise exception 'Ce quartier existe déjà dans cette ville.'; end if;
  if _fee is not null and _fee < 0 then raise exception 'Prix invalide.'; end if;
  update cm_districts set name = n, fee = _fee, note = nullif(btrim(_note), ''), is_active = coalesce(_active, is_active), updated_at = now() where id = _id;
  -- les zones qui citaient l'ancien nom suivent le nouveau
  update delivery_zones set districts = array_replace(districts, d.name, n) where lower(city) = lower(d.city) and d.name <> n;
end $$;
create or replace function public.admin_delete_district(_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d cm_districts;
begin
  perform public.admin_guard('admin_delete_district');
  select * into d from cm_districts where id = _id;
  delete from cm_districts where id = _id;
  update delivery_zones set districts = array_remove(districts, d.name) where lower(city) = lower(d.city);
end $$;
insert into public.admin_fn_sections (fn, sections) values
  ('admin_agencies', '{livraison}'), ('admin_save_agency', '{livraison}'), ('admin_delete_agency', '{livraison}'),
  ('admin_update_district', '{livraison}'), ('admin_delete_district', '{livraison}')
on conflict (fn) do update set sections = excluded.sections;

-- 8. Temps réel : le site client voit immédiatement les changements de prix, quartiers et agences
do $$ begin alter publication supabase_realtime add table public.cm_districts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.shipping_agencies; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.delivery_zones; exception when duplicate_object then null; end $$;
insert into public.cm_cities (region, city) values
('Centre','Yaoundé'),
('Centre','Mbalmayo'),
('Centre','Obala'),
('Centre','Mfou'),
('Centre','Soa'),
('Centre','Bafia'),
('Centre','Akonolinga'),
('Centre','Ayos'),
('Centre','Eséka'),
('Centre','Makak'),
('Centre','Matomb'),
('Centre','Monatélé'),
('Centre','Okola'),
('Centre','Évodoula'),
('Centre','Nanga-Eboko'),
('Centre','Minta'),
('Centre','Mbandjock'),
('Centre','Nkoteng'),
('Centre','Ntui'),
('Centre','Yoko'),
('Centre','Ngoumou'),
('Centre','Mbankomo'),
('Centre','Saa'),
('Centre','Awaé'),
('Centre','Esse'),
('Centre','Ombessa'),
('Centre','Ngog-Mapubi'),
('Centre','Messondo'),
('Centre','Ngomedzap'),
('Centre','Dzeng'),
('Littoral','Douala'),
('Littoral','Edéa'),
('Littoral','Nkongsamba'),
('Littoral','Loum'),
('Littoral','Manjo'),
('Littoral','Mbanga'),
('Littoral','Penja'),
('Littoral','Njombé'),
('Littoral','Melong'),
('Littoral','Dibombari'),
('Littoral','Bonaléa'),
('Littoral','Yabassi'),
('Littoral','Nkondjock'),
('Littoral','Pouma'),
('Littoral','Dizangué'),
('Littoral','Mouanko'),
('Littoral','Ndom'),
('Littoral','Massock'),
('Littoral','Yingui'),
('Ouest','Bafoussam'),
('Ouest','Dschang'),
('Ouest','Mbouda'),
('Ouest','Foumban'),
('Ouest','Foumbot'),
('Ouest','Bangangté'),
('Ouest','Bafang'),
('Ouest','Bandjoun'),
('Ouest','Baham'),
('Ouest','Bamendjou'),
('Ouest','Bangou'),
('Ouest','Batié'),
('Ouest','Penka-Michel'),
('Ouest','Fokoué'),
('Ouest','Santchou'),
('Ouest','Fongo-Tongo'),
('Ouest','Kékem'),
('Ouest','Bazou'),
('Ouest','Tonga'),
('Ouest','Bana'),
('Ouest','Galim'),
('Ouest','Batcham'),
('Ouest','Koutaba'),
('Ouest','Massangam'),
('Ouest','Malantouen'),
('Ouest','Kouoptamo'),
('Ouest','Magba'),
('Sud','Ebolowa'),
('Sud','Kribi'),
('Sud','Sangmélima'),
('Sud','Ambam'),
('Sud','Djoum'),
('Sud','Lolodorf'),
('Sud','Campo'),
('Sud','Akom II'),
('Sud','Bipindi'),
('Sud','Mvangan'),
('Sud','Zoétélé'),
('Sud','Meyomessala'),
('Sud','Mintom'),
('Sud','Ma''an'),
('Sud','Olamzé'),
('Sud','Niété'),
('Sud','Biwong-Bané'),
('Sud','Efoulan'),
('Est','Bertoua'),
('Est','Batouri'),
('Est','Abong-Mbang'),
('Est','Yokadouma'),
('Est','Garoua-Boulaï'),
('Est','Bélabo'),
('Est','Doumé'),
('Est','Lomié'),
('Est','Moloundou'),
('Est','Bétaré-Oya'),
('Est','Kette'),
('Est','Ndélélé'),
('Est','Messamena'),
('Est','Dimako'),
('Est','Diang'),
('Est','Mbang'),
('Est','Ngoura'),
('Est','Kentzou'),
('Est','Nguélémendouka'),
('Est','Salapoumbé'),
('Adamaoua','Ngaoundéré'),
('Adamaoua','Meiganga'),
('Adamaoua','Tibati'),
('Adamaoua','Tignère'),
('Adamaoua','Banyo'),
('Adamaoua','Ngaoundal'),
('Adamaoua','Mbé'),
('Adamaoua','Belel'),
('Adamaoua','Martap'),
('Adamaoua','Djohong'),
('Adamaoua','Dir'),
('Adamaoua','Kontcha'),
('Adamaoua','Mayo-Darlé'),
('Adamaoua','Nganha'),
('Adamaoua','Galim-Tignère'),
('Adamaoua','Mayo-Baléo'),
('Nord','Garoua'),
('Nord','Guider'),
('Nord','Poli'),
('Nord','Tcholliré'),
('Nord','Figuil'),
('Nord','Pitoa'),
('Nord','Lagdo'),
('Nord','Touboro'),
('Nord','Rey-Bouba'),
('Nord','Mayo-Oulo'),
('Nord','Dembo'),
('Nord','Bibémi'),
('Nord','Gaschiga'),
('Nord','Beka'),
('Nord','Madingring'),
('Nord','Ngong'),
('Nord','Barndaké'),
('Extrême-Nord','Maroua'),
('Extrême-Nord','Kousséri'),
('Extrême-Nord','Mokolo'),
('Extrême-Nord','Mora'),
('Extrême-Nord','Yagoua'),
('Extrême-Nord','Kaélé'),
('Extrême-Nord','Mindif'),
('Extrême-Nord','Guidiguis'),
('Extrême-Nord','Doukoula'),
('Extrême-Nord','Bogo'),
('Extrême-Nord','Pette'),
('Extrême-Nord','Makary'),
('Extrême-Nord','Waza'),
('Extrême-Nord','Koza'),
('Extrême-Nord','Tokombéré'),
('Extrême-Nord','Méri'),
('Extrême-Nord','Gazawa'),
('Extrême-Nord','Maga'),
('Extrême-Nord','Kar-Hay'),
('Extrême-Nord','Moulvoudaye'),
('Extrême-Nord','Bourha'),
('Extrême-Nord','Kolofata'),
('Extrême-Nord','Goulfey'),
('Extrême-Nord','Blangoua'),
('Extrême-Nord','Logone-Birni'),
('Extrême-Nord','Mozogo'),
('Extrême-Nord','Hina'),
('Extrême-Nord','Datcheka'),
('Nord-Ouest','Bamenda'),
('Nord-Ouest','Kumbo'),
('Nord-Ouest','Wum'),
('Nord-Ouest','Ndop'),
('Nord-Ouest','Nkambé'),
('Nord-Ouest','Mbengwi'),
('Nord-Ouest','Fundong'),
('Nord-Ouest','Bali'),
('Nord-Ouest','Bafut'),
('Nord-Ouest','Santa'),
('Nord-Ouest','Batibo'),
('Nord-Ouest','Jakiri'),
('Nord-Ouest','Ndu'),
('Nord-Ouest','Bambui'),
('Nord-Ouest','Tubah'),
('Nord-Ouest','Bamessing'),
('Nord-Ouest','Oku'),
('Nord-Ouest','Misaje'),
('Nord-Ouest','Furu-Awa'),
('Nord-Ouest','Benakuma'),
('Nord-Ouest','Widikum'),
('Sud-Ouest','Buéa'),
('Sud-Ouest','Limbé'),
('Sud-Ouest','Kumba'),
('Sud-Ouest','Tiko'),
('Sud-Ouest','Mamfé'),
('Sud-Ouest','Muyuka'),
('Sud-Ouest','Mutengene'),
('Sud-Ouest','Mundemba'),
('Sud-Ouest','Bangem'),
('Sud-Ouest','Idenau'),
('Sud-Ouest','Nguti'),
('Sud-Ouest','Ekondo-Titi'),
('Sud-Ouest','Tombel'),
('Sud-Ouest','Fontem'),
('Sud-Ouest','Akwaya'),
('Sud-Ouest','Mbonge'),
('Sud-Ouest','Konye'),
('Sud-Ouest','Eyumodjock'),
('Sud-Ouest','Bamusso')
on conflict do nothing;
