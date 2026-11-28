-- =====================================================================================
-- Livraison : « Livraison offerte avec Prime » uniquement.
--  * Le prix du quartier (ou de la ville) réglé dans l'admin est TOUJOURS appliqué aux non-membres :
--    le seuil « livraison offerte au-delà de X FCFA » n'est plus utilisé (il effaçait le prix du quartier).
--  * Membres Prime à Yaoundé et Douala : livraison offerte.
--  * Membres Prime hors de Yaoundé / Douala : la livraison jusqu'à l'agence est offerte,
--    l'expédition (tarif de l'agence vers la ville du client) reste payée par le client.
--  * Les conditions réglées par l'admin (minimum, quota, exclusions) restent appliquées.
-- Aucune donnée supprimée.
-- =====================================================================================

-- ---------- Frais normaux : prix du quartier / de la ville, sans seuil de gratuité ----------
create or replace function public.delivery_quote_base(_city text, _subtotal integer, _district text, _agency uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare s public.platform_settings; z public.delivery_zones; d public.cm_districts; a public.shipping_agencies;
  fee int; reg text := public.cm_region_of(_city); ags jsonb; afee int; dfee int;
begin
  select * into s from platform_settings where id = 1;
  if public.is_local_city(_city) then
    select * into z from delivery_zones where is_active and lower(btrim(city)) = lower(btrim(coalesce(_city, ''))) limit 1;
    select * into d from cm_districts where is_active and lower(city) = lower(btrim(coalesce(_city, ''))) and lower(name) = lower(btrim(coalesce(_district, ''))) limit 1;
    fee := coalesce(d.fee, z.fee, s.shipping_fee, 0);
    return jsonb_build_object('mode', 'amashia', 'fee', fee,
      'base_fee', fee, 'district_fee', d.fee, 'free_threshold', 0, 'zone', z.city, 'region', reg,
      'delay_label', 'Entre 30 min et 4 h', 'days', 0);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone, 'address', x.address,
      'depot', nullif(concat_ws(', ', x.depot_district, x.depot_city), ''),
      'shipping_fee', public.agency_city_fee(x, _city),
      'dropoff_fee', public.agency_dropoff_fee(coalesce(x.depot_city, 'Yaoundé'), x.depot_district),
      'fee', public.agency_city_fee(x, _city) + public.agency_dropoff_fee(coalesce(x.depot_city, 'Yaoundé'), x.depot_district),
      'delay', x.delay_text, 'notes', x.notes)
      order by x.sort, public.agency_city_fee(x, _city) + public.agency_dropoff_fee(coalesce(x.depot_city, 'Yaoundé'), x.depot_district), x.name), '[]'::jsonb)
    into ags from shipping_agencies x
    where x.is_active and reg is not null and reg = any(x.regions)
      and (cardinality(x.cities) = 0 or lower(btrim(coalesce(_city, ''))) = any(select lower(c) from unnest(x.cities) c));
  if _agency is not null then
    select * into a from shipping_agencies x where x.id = _agency and x.is_active and reg = any(x.regions)
      and (cardinality(x.cities) = 0 or lower(btrim(coalesce(_city, ''))) = any(select lower(c) from unnest(x.cities) c));
    if a.id is not null then
      afee := public.agency_city_fee(a, _city);
      dfee := public.agency_dropoff_fee(coalesce(a.depot_city, 'Yaoundé'), a.depot_district);
    end if;
  end if;
  return jsonb_build_object('mode', 'agency', 'region', reg, 'agencies', ags,
    'agency', case when a.id is null then null else jsonb_build_object('id', a.id, 'name', a.name, 'fee', afee + dfee, 'shipping_fee', afee, 'dropoff_fee', dfee,
      'depot', nullif(concat_ws(', ', a.depot_district, a.depot_city), ''), 'delay', a.delay_text) end,
    'fee', coalesce(afee + dfee, 0), 'base_fee', coalesce(afee + dfee, 0), 'agency_fee', afee, 'dropoff_fee', dfee,
    'free_threshold', 0, 'delay_label', 'Selon l''agence d''expédition choisie', 'days', null);
end $function$;

-- ---------- Décision Prime ----------
create or replace function public.prime_apply_quote(_uid uuid, _q jsonb, _city text, _subtotal integer, _products uuid[])
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare ps public.prime_settings; sub uuid; reason text; used int; norm text := lower(translate(btrim(coalesce(_city, '')), 'éÉèÈ', 'eEeE'));
  fee int := coalesce((_q->>'fee')::int, 0); agency boolean := _q->>'mode' = 'agency';
  ship int := coalesce((_q->>'agency_fee')::int, 0); drop_ int := coalesce((_q->>'dropoff_fee')::int, 0);
begin
  select * into ps from prime_settings where id = 1;
  if _uid is not null then sub := public.prime_current_subscription(_uid); end if;
  if sub is null or ps.id is null or not ps.enabled then
    return _q || jsonb_build_object('prime', false, 'prime_member', sub is not null, 'prime_included', false, 'prime_reason', null, 'standard_fee', fee);
  end if;
  if agency and not ps.agencies_included then
    reason := 'Hors zone Prime : envoi par agence';
  elsif not agency and not exists (select 1 from unnest(ps.home_cities) c where lower(translate(btrim(c), 'éÉèÈ', 'eEeE')) = norm) then
    reason := 'Hors zone Prime';
  elsif coalesce(_subtotal, 0) < ps.min_order_fcfa then
    reason := format('Sous le minimum Prime (%s FCFA)', to_char(ps.min_order_fcfa, 'FM999G999G999'));
  elsif _products is not null and exists (
      select 1 from products p where p.id = any(_products)
        and (not p.is_prime or p.id = any(ps.excluded_products) or p.category_slug = any(ps.excluded_categories))) then
    reason := 'Article exclu de la livraison offerte avec Prime';
  elsif ps.monthly_quota is not null then
    select count(*) into used from orders o
     where o.user_id = _uid and o.prime_delivery_included and o.status <> 'Annulée'
       and o.created_at >= date_trunc('month', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala';
    if used >= ps.monthly_quota then reason := format('Quota Prime du mois atteint (%s livraisons)', ps.monthly_quota); end if;
  end if;
  if reason is not null then
    return _q || jsonb_build_object('prime', false, 'prime_member', true, 'prime_included', false, 'prime_reason', reason, 'standard_fee', fee);
  end if;
  if agency then
    -- livraison jusqu'à l'agence offerte ; l'expédition (tarif de l'agence) reste à la charge du client
    return _q || jsonb_build_object('fee', ship, 'prime', true, 'prime_member', true, 'prime_included', true, 'prime_reason', null,
      'standard_fee', fee, 'prime_cost', drop_, 'prime_subscription_id', sub);
  end if;
  return _q || jsonb_build_object('fee', 0, 'prime', true, 'prime_member', true, 'prime_included', true, 'prime_reason', null,
    'standard_fee', fee, 'prime_cost', coalesce((_q->>'base_fee')::int, fee), 'prime_subscription_id', sub,
    'delay_label', ps.delay_label);
end $function$;

-- Réglages : Yaoundé et Douala à domicile, livraison jusqu'à l'agence offerte pour les autres villes.
update public.prime_settings set
  home_cities = (select array_agg(distinct c) from unnest(home_cities || array['Yaoundé', 'Douala']) c),
  agencies_included = true,
  delay_label = case when delay_label = 'Entre 30 min et 4 h à Yaoundé' then 'Entre 30 min et 4 h à Yaoundé et Douala' else delay_label end,
  updated_at = now()
where id = 1;

-- ---------- Assistant (chatbot) : même vocabulaire ----------
CREATE OR REPLACE FUNCTION public.assistant_delivery(_city text, _district text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare q jsonb := delivery_quote_v2(_city, 20000, _district);
begin
  return jsonb_build_object('ville', _city, 'quartier', _district, 'mode', case q->>'mode' when 'agency' then 'Expédition par agence de voyage' else 'Livraison à domicile par Amachia' end,
    'frais_fcfa', q->'fee', 'delai', q->>'delay_label',
    'expedition', case when q->>'mode' = 'agency' then 'Hors de Yaoundé et Douala : le client paie la livraison jusqu''à l''agence (offerte avec Prime) et les frais d''expédition de l''agence vers sa ville. Les frais d''expédition reviennent à l''agence, pas à Amachia.' end,
    'agences', (select jsonb_agg(jsonb_build_object('nom', a.name, 'depot', concat_ws(', ', a.depot_district, a.depot_city), 'adresse', a.address, 'delai', a.delay_text))
                from shipping_agencies a where a.is_active and (_city = any(a.cities) or a.cities is null)),
    'prime', (select jsonb_build_object('formulation_obligatoire', 'Livraison offerte avec Prime (uniquement pour les abonnés Prime)', 'proposee', ps.enabled, 'abonnement_des_fcfa_par_mois', (select min(round(pl.price::numeric / greatest(1, coalesce(round(pl.duration_days / 30.0), pl.months, 1)))) from prime_plans pl where pl.is_active), 'villes_a_domicile', ps.home_cities, 'hors_yaounde_douala', 'livraison jusqu''à l''agence offerte, expédition payée par le client', 'minimum_commande_fcfa', ps.min_order_fcfa, 'livraisons_offertes_par_mois', ps.monthly_quota, 'conditions', 'https://amachia.com/legal/prime') from prime_settings ps where ps.id = 1));
end $function$;
