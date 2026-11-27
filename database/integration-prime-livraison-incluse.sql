-- =====================================================================================
-- Amachia Prime — modèle « livraison incluse »  (branche feat/prime-livraison-incluse)
--
-- NE PAS APPLIQUER EN PRODUCTION SANS ACCORD EXPLICITE DU PROPRIÉTAIRE.
-- Migration ADDITIVE : aucune table, colonne ni ligne supprimée.
--
-- 1. Un seul prix par produit : la base n'a jamais eu de colonne « prix Prime » sur les produits
--    (le 2e prix était calculé uniquement dans le navigateur). Les anciens réglages
--    platform_settings.prime_price / prime_free_shipping deviennent inutilisés (dépréciés).
-- 2. prime_plans : durée en jours + description anglaise.
-- 3. prime_subscriptions : statut (en_attente | actif | expire | resilie), renouvellement, moyen de paiement,
--    résiliation, acceptation des conditions.
-- 4. prime_settings : réglages de la livraison incluse (modifiables par l'admin).
-- 5. orders : livraison incluse Prime oui/non, abonnement, coût de la livraison pris en charge par Amachia.
-- 6. delivery_quote_v3 : calcul UNIQUE des frais (panier + validation de commande), côté serveur.
-- 7. Parcours d'abonnement (demande en attente, activation manuelle par l'admin : aucun paiement en ligne n'est intégré).
-- =====================================================================================

-- ---------- 1. Anciens réglages dépréciés (conservés, plus lus par le code) ----------
comment on column public.platform_settings.prime_price is
  'DÉPRÉCIÉ (Prime livraison incluse) : remplacé par prime_plans.price. Conservé ; suppression proposée dans integration-prime-nettoyage-plus-tard.sql.';
comment on column public.platform_settings.prime_free_shipping is
  'DÉPRÉCIÉ (Prime livraison incluse) : remplacé par prime_settings.enabled. Conservé ; suppression proposée plus tard.';
comment on column public.products.is_prime is
  'Produit éligible à la livraison incluse Prime (false = jamais inclus, ex. très lourd ou volumineux).';

-- ---------- 2. Formules ----------
alter table public.prime_plans add column if not exists duration_days integer;
alter table public.prime_plans add column if not exists description_en text;
update public.prime_plans set duration_days = months * 30 where duration_days is null;
-- pas de valeur par défaut : une formule créée sans durée en jours utilise months × 30 (coalesce dans les fonctions)
comment on column public.prime_plans.price is 'Prix TTC (FCFA) de la formule pour toute sa durée (duration_days). Formule mensuelle : prix par mois.';

-- vocabulaire : plus de « livraison gratuite » pour Prime (texte modifié, rien supprimé)
update public.prime_plans
   set benefits = array(select case when b ilike '%livraison gratuite%' then 'Livraison incluse avec Prime, selon les conditions Prime' else b end from unnest(benefits) b)
 where exists (select 1 from unnest(benefits) b where b ilike '%livraison gratuite%');

-- ---------- 3. Abonnements ----------
alter table public.prime_subscriptions add column if not exists status text not null default 'actif';
alter table public.prime_subscriptions add column if not exists auto_renew boolean not null default false;
alter table public.prime_subscriptions add column if not exists payment_method text;
alter table public.prime_subscriptions add column if not exists price_fcfa integer;
alter table public.prime_subscriptions add column if not exists cancelled_at timestamptz;
alter table public.prime_subscriptions add column if not exists accepted_terms_at timestamptz;
alter table public.prime_subscriptions add column if not exists terms_version text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'prime_subscriptions_status_check') then
    alter table public.prime_subscriptions add constraint prime_subscriptions_status_check
      check (status in ('en_attente', 'actif', 'expire', 'resilie'));
  end if;
end $$;
-- un abonnement résilié par l'admin avant ce changement reste « résilié »
update public.prime_subscriptions set status = 'resilie' where not is_active and status = 'actif';
create index if not exists prime_subscriptions_user_idx on public.prime_subscriptions (user_id, status, expires_at);
-- les demandes en attente n'ont pas encore de dates
alter table public.prime_subscriptions alter column starts_at drop not null;
alter table public.prime_subscriptions alter column expires_at drop not null;

-- ---------- 4. Réglages de la livraison incluse ----------
create table if not exists public.prime_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,                       -- la livraison incluse est-elle proposée ?
  home_cities text[] not null default '{Yaoundé}',              -- villes livrées à domicile incluses
  agencies_included boolean not null default false,             -- envoi par agence (autres villes) inclus ?
  min_order_fcfa integer not null default 0 check (min_order_fcfa >= 0),   -- 0 = aucun minimum
  monthly_quota integer check (monthly_quota is null or monthly_quota > 0), -- null = illimité
  excluded_categories text[] not null default '{}',             -- slugs de catégories exclues
  excluded_products uuid[] not null default '{}',               -- produits exclus
  delay_label text not null default 'Entre 30 min et 4 h à Yaoundé',
  terms_version text not null default '2026-11',
  updated_at timestamptz not null default now()
);
-- VALEURS PAR DÉFAUT PRUDENTES, À CONFIRMER PAR LE PROPRIÉTAIRE (voir docs/PRIME.md)
insert into public.prime_settings (id, enabled, home_cities, agencies_included, min_order_fcfa, monthly_quota)
values (1, true, '{Yaoundé}', false, 0, 4)
on conflict (id) do nothing;
alter table public.prime_settings enable row level security;
drop policy if exists "Lecture publique des réglages Prime" on public.prime_settings;
create policy "Lecture publique des réglages Prime" on public.prime_settings for select using (true);
-- aucune politique d'écriture : seules les fonctions admin (SECURITY DEFINER + admin_guard) modifient

-- ---------- 5. Commandes : traçabilité comptable ----------
alter table public.orders add column if not exists prime_delivery_included boolean not null default false;
alter table public.orders add column if not exists prime_subscription_id uuid references public.prime_subscriptions(id);
alter table public.orders add column if not exists prime_delivery_cost_fcfa integer;   -- coût réel pris en charge par Amachia
alter table public.orders add column if not exists shipping_note text;                 -- raison affichée (ex. « Hors zone Prime »)
comment on column public.orders.prime_delivery_cost_fcfa is 'Frais de livraison normaux de la commande, payés par Amachia (jamais par le vendeur) quand la livraison est incluse avec Prime.';

-- ---------- Statut Prime (serveur) ----------
-- actif = statut actif (ou résilié mais période déjà payée en cours) et dates valides
create or replace function public.prime_active(_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.prime_subscriptions
                 where user_id = _uid and is_active and status in ('actif', 'resilie')
                   and starts_at <= now() and expires_at > now())
$$;

create or replace function public.prime_current_subscription(_uid uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.prime_subscriptions
   where user_id = _uid and is_active and status in ('actif', 'resilie') and starts_at <= now() and expires_at > now()
   order by expires_at desc limit 1
$$;
revoke execute on function public.prime_current_subscription(uuid) from public, anon, authenticated;

-- ---------- 6. Calcul unique des frais de livraison ----------
-- Frais NORMAUX (sans Prime) : mêmes règles qu'avant (quartier, zone, seuil, agences).
create or replace function public.delivery_quote_base(_city text, _subtotal integer, _district text, _agency uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s public.platform_settings; z public.delivery_zones; d public.cm_districts; a public.shipping_agencies;
  fee int; thr int; reg text := public.cm_region_of(_city); ags jsonb; afee int; dfee int;
begin
  select * into s from platform_settings where id = 1;
  if public.is_local_city(_city) then
    select * into z from delivery_zones where is_active and lower(btrim(city)) = lower(btrim(coalesce(_city, ''))) limit 1;
    select * into d from cm_districts where is_active and lower(city) = lower(btrim(coalesce(_city, ''))) and lower(name) = lower(btrim(coalesce(_district, ''))) limit 1;
    fee := coalesce(d.fee, z.fee, s.shipping_fee);
    thr := coalesce(z.free_threshold, s.free_shipping_threshold);
    return jsonb_build_object('mode', 'amashia', 'fee', case when thr > 0 and coalesce(_subtotal, 0) > thr then 0 else fee end,
      'base_fee', fee, 'district_fee', d.fee, 'free_threshold', thr, 'zone', z.city, 'region', reg,
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
end $$;

-- Ajoute la décision Prime aux frais normaux, pour un client donné (appel interne uniquement).
create or replace function public.prime_apply_quote(_uid uuid, _q jsonb, _city text, _subtotal integer, _products uuid[])
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare ps public.prime_settings; sub uuid; reason text; used int; norm text := lower(translate(btrim(coalesce(_city, '')), 'éÉèÈ', 'eEeE'));
  fee int := coalesce((_q->>'fee')::int, 0);
begin
  select * into ps from prime_settings where id = 1;
  if _uid is not null then sub := public.prime_current_subscription(_uid); end if;
  if sub is null or ps.id is null or not ps.enabled then
    return _q || jsonb_build_object('prime', false, 'prime_member', sub is not null, 'prime_included', false, 'prime_reason', null, 'standard_fee', fee);
  end if;
  if _q->>'mode' = 'agency' and not ps.agencies_included then
    reason := 'Hors zone Prime : envoi par agence';
  elsif _q->>'mode' = 'amashia' and not exists (select 1 from unnest(ps.home_cities) c where lower(translate(btrim(c), 'éÉèÈ', 'eEeE')) = norm) then
    reason := 'Hors zone Prime';
  elsif coalesce(_subtotal, 0) < ps.min_order_fcfa then
    reason := format('Sous le minimum Prime (%s FCFA)', to_char(ps.min_order_fcfa, 'FM999G999G999'));
  elsif _products is not null and exists (
      select 1 from products p where p.id = any(_products)
        and (not p.is_prime or p.id = any(ps.excluded_products) or p.category_slug = any(ps.excluded_categories))) then
    reason := 'Article exclu de la livraison incluse';
  elsif ps.monthly_quota is not null then
    select count(*) into used from orders o
     where o.user_id = _uid and o.prime_delivery_included and o.status <> 'Annulée'
       and o.created_at >= date_trunc('month', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala';
    if used >= ps.monthly_quota then reason := format('Quota Prime du mois atteint (%s livraisons)', ps.monthly_quota); end if;
  end if;
  if reason is not null then
    return _q || jsonb_build_object('prime', false, 'prime_member', true, 'prime_included', false, 'prime_reason', reason, 'standard_fee', fee);
  end if;
  return _q || jsonb_build_object('fee', 0, 'prime', true, 'prime_member', true, 'prime_included', true, 'prime_reason', null,
    'standard_fee', fee, 'prime_cost', coalesce((_q->>'base_fee')::int, fee), 'prime_subscription_id', sub,
    'delay_label', case when _q->>'mode' = 'amashia' then ps.delay_label else _q->>'delay_label' end);
end $$;
revoke execute on function public.prime_apply_quote(uuid, jsonb, text, integer, uuid[]) from public, anon, authenticated;

-- Fonction publique unique (panier, fiche produit, paiement). Le statut Prime vient de la session (auth.uid()).
create or replace function public.delivery_quote_v3(_city text, _subtotal integer, _district text default null, _agency uuid default null, _products uuid[] default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select public.prime_apply_quote(auth.uid(), public.delivery_quote_base(_city, _subtotal, _district, _agency), _city, _subtotal, _products)
$$;
grant execute on function public.delivery_quote_v3(text, integer, text, uuid, uuid[]) to anon, authenticated;

-- compatibilité : les anciens appels passent par le nouveau calcul
create or replace function public.delivery_quote_v2(_city text, _subtotal integer, _district text default null, _agency uuid default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select public.delivery_quote_v3(_city, _subtotal, _district, _agency, null)
$$;

-- ---------- 7. Parcours d'abonnement (client) ----------
-- Statut complet pour « Mon compte » et la page /prime
create or replace function public.customer_prime()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'active', public.prime_active(auth.uid()),
    'current', (select jsonb_build_object('id', p.id, 'plan', pl.name, 'status', p.status, 'starts_at', p.starts_at, 'expires_at', p.expires_at,
                  'auto_renew', p.auto_renew, 'cancelled_at', p.cancelled_at, 'price', coalesce(p.price_fcfa, p.amount_paid, pl.price))
                from prime_subscriptions p left join prime_plans pl on pl.id = p.plan_id
                where p.id = public.prime_current_subscription(auth.uid())),
    'expires_at', (select expires_at from prime_subscriptions where id = public.prime_current_subscription(auth.uid())),
    'plan', (select pl.name from prime_subscriptions p join prime_plans pl on pl.id = p.plan_id where p.id = public.prime_current_subscription(auth.uid())),
    'pending', (select jsonb_build_object('id', p.id, 'plan', pl.name, 'price', p.price_fcfa, 'payment_method', p.payment_method, 'created_at', p.created_at)
                from prime_subscriptions p left join prime_plans pl on pl.id = p.plan_id
                where p.user_id = auth.uid() and p.status = 'en_attente' order by p.created_at desc limit 1),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'plan', pl.name, 'status',
                  case when p.status in ('actif', 'resilie') and p.expires_at <= now() then 'expire' else p.status end,
                  'created_at', p.created_at, 'starts_at', p.starts_at, 'expires_at', p.expires_at,
                  'amount_paid', p.amount_paid, 'price', p.price_fcfa, 'payment_method', p.payment_method, 'payment_ref', p.payment_ref) order by p.created_at desc)
                from prime_subscriptions p left join prime_plans pl on pl.id = p.plan_id where p.user_id = auth.uid()), '[]'::jsonb),
    'used_this_month', (select count(*) from orders o where o.user_id = auth.uid() and o.prime_delivery_included and o.status <> 'Annulée'
                          and o.created_at >= date_trunc('month', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala'),
    'settings', (select to_jsonb(ps) - 'excluded_products' - 'updated_at' from prime_settings ps where ps.id = 1),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'months', p.months, 'duration_days', p.duration_days, 'price', p.price,
                  'description', p.description, 'description_en', p.description_en, 'benefits', to_jsonb(p.benefits)) order by p.sort_order, p.price)
                from prime_plans p where p.is_active), '[]'::jsonb))
$$;

-- Demande d'abonnement : enregistrée « en attente de paiement », activée par l'admin après réception du paiement.
create or replace function public.customer_prime_subscribe(_plan uuid, _accept boolean, _auto_renew boolean, _payment_method text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); pl prime_plans; ps prime_settings; nid uuid;
begin
  if uid is null then raise exception 'Connectez-vous pour rejoindre Prime.'; end if;
  if not coalesce(_accept, false) then raise exception 'Vous devez accepter les conditions de l''abonnement Prime.'; end if;
  if coalesce(_payment_method, '') not in ('Orange Money', 'Mobile Money', 'Carte bancaire', 'Espèces') then raise exception 'Choisissez un moyen de paiement.'; end if;
  select * into pl from prime_plans where id = _plan and is_active;
  if pl.id is null then raise exception 'Cette formule n''est plus disponible.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('prime-' || uid::text, 0));
  if exists (select 1 from prime_subscriptions where user_id = uid and status = 'en_attente') then
    raise exception 'Vous avez déjà une demande en attente de paiement.';
  end if;
  select * into ps from prime_settings where id = 1;
  insert into prime_subscriptions (user_id, plan_id, status, is_active, auto_renew, payment_method, price_fcfa, accepted_terms_at, terms_version)
  values (uid, pl.id, 'en_attente', false, coalesce(_auto_renew, false), _payment_method, pl.price, now(), coalesce(ps.terms_version, '2026-11'))
  returning id into nid;
  return nid;
end $$;
grant execute on function public.customer_prime_subscribe(uuid, boolean, boolean, text) to authenticated;

-- Renouvellement automatique : activer / désactiver (aucun prélèvement n'est fait automatiquement tant que le paiement n'est pas intégré)
create or replace function public.customer_prime_set_renewal(_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update prime_subscriptions set auto_renew = coalesce(_on, false)
   where user_id = auth.uid() and (id = public.prime_current_subscription(auth.uid()) or status = 'en_attente');
end $$;
grant execute on function public.customer_prime_set_renewal(boolean) to authenticated;

-- Résiliation (un clic) : demande en attente annulée tout de suite ; abonnement actif résilié, avantages jusqu'à la fin de la période payée.
create or replace function public.customer_prime_cancel()
returns text language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update prime_subscriptions set status = 'resilie', cancelled_at = now(), auto_renew = false
   where user_id = auth.uid() and status = 'en_attente';
  get diagnostics n = row_count;
  update prime_subscriptions set status = 'resilie', cancelled_at = now(), auto_renew = false
   where user_id = auth.uid() and status = 'actif' and is_active and expires_at > now();
  if found then return 'resilie'; end if;
  return case when n > 0 then 'demande_annulee' else 'aucun' end;
end $$;
grant execute on function public.customer_prime_cancel() to authenticated;

-- ---------- Admin ----------
create or replace function public.admin_activate_prime(_id uuid, _ref text, _amount integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare s prime_subscriptions; pl prime_plans; cur timestamptz;
begin
  perform public.admin_guard('admin_activate_prime');
  select * into s from prime_subscriptions where id = _id for update;
  if s.id is null or s.status <> 'en_attente' then raise exception 'Cette demande n''est plus en attente.'; end if;
  select * into pl from prime_plans where id = s.plan_id;
  select max(expires_at) into cur from prime_subscriptions where user_id = s.user_id and is_active and expires_at > now();
  update prime_subscriptions set status = 'actif', is_active = true,
    starts_at = coalesce(cur, now()),
    expires_at = coalesce(cur, now()) + make_interval(days => coalesce(pl.duration_days, pl.months * 30, 30)),
    amount_paid = coalesce(_amount, s.price_fcfa, pl.price), payment_ref = nullif(btrim(coalesce(_ref, '')), '')
  where id = _id;
end $$;

create or replace function public.admin_reject_prime(_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.admin_guard('admin_reject_prime');
  update prime_subscriptions set status = 'resilie', cancelled_at = now() where id = _id and status = 'en_attente';
end $$;

-- résiliation par l'admin : statut résilié (la ligne est conservée)
create or replace function public.admin_cancel_prime(_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.admin_guard('admin_cancel_prime');
  update public.prime_subscriptions set is_active = false, status = 'resilie', cancelled_at = coalesce(cancelled_at, now()), auto_renew = false where id = _id;
end $$;

create or replace function public.admin_save_prime_settings(_s jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.admin_guard('admin_save_prime_settings');
  update prime_settings set
    enabled = coalesce((_s->>'enabled')::boolean, enabled),
    home_cities = coalesce((select array_agg(btrim(c)) from jsonb_array_elements_text(_s->'home_cities') c where btrim(c) <> ''), case when _s ? 'home_cities' then '{}'::text[] else home_cities end),
    agencies_included = coalesce((_s->>'agencies_included')::boolean, agencies_included),
    min_order_fcfa = greatest(0, coalesce((_s->>'min_order_fcfa')::int, min_order_fcfa)),
    monthly_quota = case when _s ? 'monthly_quota' then nullif(greatest(0, coalesce((_s->>'monthly_quota')::int, 0)), 0) else monthly_quota end,
    excluded_categories = case when _s ? 'excluded_categories' then coalesce((select array_agg(c) from jsonb_array_elements_text(_s->'excluded_categories') c), '{}') else excluded_categories end,
    excluded_products = case when _s ? 'excluded_products' then coalesce((select array_agg(c::uuid) from jsonb_array_elements_text(_s->'excluded_products') c), '{}') else excluded_products end,
    delay_label = coalesce(nullif(btrim(_s->>'delay_label'), ''), delay_label),
    updated_at = now()
  where id = 1;
end $$;

create or replace function public.admin_save_prime_plan_extra(_id uuid, _duration_days integer, _description_en text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.admin_guard('admin_save_prime_plan');
  if _duration_days is not null and (_duration_days < 1 or _duration_days > 730) then raise exception 'Durée invalide (1 à 730 jours).'; end if;
  update prime_plans set duration_days = coalesce(_duration_days, duration_days), description_en = nullif(btrim(coalesce(_description_en, '')), '') where id = _id;
end $$;

-- Tableau de bord admin : ancien contenu + statuts, demandes en attente, réglages, livraisons incluses du mois et coût réel
create or replace function public.admin_prime()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala';
begin
  perform public.admin_guard('admin_prime');
  return jsonb_build_object(
    'active', (select count(distinct user_id) from prime_subscriptions where is_active and status in ('actif', 'resilie') and starts_at <= now() and expires_at > now()),
    'pending', (select count(*) from prime_subscriptions where status = 'en_attente'),
    'expiring', (select count(distinct user_id) from prime_subscriptions where is_active and status in ('actif', 'resilie') and expires_at > now() and expires_at < now() + interval '7 days'),
    'new_30d', (select count(*) from prime_subscriptions where created_at > now() - interval '30 days' and status <> 'en_attente'),
    'revenue_total', (select coalesce(sum(amount_paid), 0) from prime_subscriptions),
    'revenue_30d', (select coalesce(sum(amount_paid), 0) from prime_subscriptions where created_at > now() - interval '30 days'),
    'included_month', (select count(*) from orders where prime_delivery_included and status <> 'Annulée' and created_at >= m0),
    'included_cost_month', (select coalesce(sum(prime_delivery_cost_fcfa), 0) from orders where prime_delivery_included and status <> 'Annulée' and created_at >= m0),
    'included_cost_total', (select coalesce(sum(prime_delivery_cost_fcfa), 0) from orders where prime_delivery_included and status <> 'Annulée'),
    'settings', (select to_jsonb(ps) from prime_settings ps where ps.id = 1),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'months', p.months, 'duration_days', p.duration_days, 'price', p.price,
        'description', p.description, 'description_en', p.description_en, 'benefits', to_jsonb(p.benefits), 'is_active', p.is_active,
        'subscribers', (select count(distinct user_id) from prime_subscriptions s where s.plan_id = p.id and s.is_active and s.status in ('actif', 'resilie') and s.expires_at > now()),
        'revenue', (select coalesce(sum(amount_paid), 0) from prime_subscriptions s where s.plan_id = p.id)) order by p.sort_order, p.price) from prime_plans p), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'revenue', coalesce(r.rev, 0), 'subs', coalesce(r.n, 0)) order by m)
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
        left join (select date_trunc('month', created_at) mo, sum(amount_paid) rev, count(*) n from prime_subscriptions where status <> 'en_attente' group by 1) r on r.mo = m), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', p.id, 'user_id', p.user_id, 'name', coalesce(pr.full_name, ''), 'email', u.email, 'phone', pr.phone,
        'starts_at', p.starts_at, 'expires_at', p.expires_at, 'created_at', p.created_at, 'plan', pl.name, 'amount_paid', p.amount_paid, 'payment_ref', p.payment_ref,
        'price', p.price_fcfa, 'payment_method', p.payment_method, 'auto_renew', p.auto_renew,
        'status', case when p.status in ('actif', 'resilie') and p.expires_at is not null and p.expires_at <= now() then 'expire' else p.status end,
        'orders', (select count(*) from orders o where o.user_id = p.user_id and o.status <> 'Annulée' and o.created_at between p.starts_at and p.expires_at),
        'included', (select count(*) from orders o where o.prime_subscription_id = p.id and o.prime_delivery_included and o.status <> 'Annulée'),
        'active', p.is_active and p.status in ('actif', 'resilie') and p.starts_at <= now() and p.expires_at > now(), 'cancelled', p.status = 'resilie') x
      from prime_subscriptions p left join profiles pr on pr.id = p.user_id left join auth.users u on u.id = p.user_id
      left join prime_plans pl on pl.id = p.plan_id) t), '[]'::jsonb));
end $$;

-- ---------- Droits des nouvelles fonctions admin (mêmes sections que les fonctions Prime existantes) ----------
insert into public.admin_fn_sections (fn, sections) values
  ('admin_activate_prime', '{prime,clients}'), ('admin_reject_prime', '{prime,clients}'), ('admin_save_prime_settings', '{prime}')
on conflict (fn) do nothing;

-- ---------- Validation de commande : même calcul que le panier (delivery_quote_base + prime_apply_quote) ----------
-- Copie de la fonction en production, seules 2 lignes changent (repérées par « Prime »).
CREATE OR REPLACE FUNCTION public.customer_checkout(p_request uuid, p_lines jsonb, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q2 jsonb; bal integer; use_ integer; uid uuid:=auth.uid(); oid uuid; line jsonb; prod public.products%rowtype; qty integer; sub integer:=0; fee integer; promo text:=upper(btrim(coalesce(p_details->>'promo',''))); ev jsonb; disc integer:=0; elig integer; left_ integer; n integer; i integer:=0; it record; part integer; BEGIN
 IF uid IS NULL AND coalesce(p_details->>'guest','')<>'true' THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(uid::text, 'guest-'||p_request::text),0));
 SELECT id INTO oid FROM public.orders WHERE user_id IS NOT DISTINCT FROM uid AND request_key=p_request; IF oid IS NOT NULL THEN RETURN oid; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Panier invalide'; END IF;
 IF coalesce(p_details->>'city','')='' OR (coalesce(p_details->>'district','')='' AND public.is_local_city(p_details->>'city')) OR coalesce(p_details->>'fullName','')='' OR coalesce(p_details->>'phone','')='' THEN RAISE EXCEPTION 'Adresse et coordonnées requises'; END IF;
 IF coalesce(p_details->>'payment','') NOT IN ('Paiement à la livraison','Orange Money','Mobile Money','Carte bancaire') THEN RAISE EXCEPTION 'Paiement invalide'; END IF;
 -- Coupon vendeur : verrouillé pour respecter le nombre maximum d'utilisations
 IF promo<>'' THEN
  PERFORM 1 FROM public.seller_coupons WHERE upper(code)=promo FOR UPDATE;
  ev:=public.coupon_eval(promo,p_lines,uid);
  IF NOT coalesce((ev->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Code promotionnel : %', ev->>'message'; END IF;
  IF uid IS NULL AND EXISTS (SELECT 1 FROM public.orders WHERE coupon_code=ev->>'code' AND status<>'Annulée'
       AND (contact_phone=p_details->>'phone' OR lower(contact_email)=lower(coalesce(p_details->>'email','-')))) THEN
   RAISE EXCEPTION 'Code promotionnel : Vous avez déjà utilisé ce coupon.';
  END IF;
 END IF;
 -- Deterministic locks avoid concurrent overselling and deadlocks.
 PERFORM id FROM public.products WHERE id IN (SELECT (value->>'productId')::uuid FROM jsonb_array_elements(p_lines)) ORDER BY id FOR UPDATE;
 INSERT INTO public.orders(user_id,request_key,order_number,city,district,address_details,full_name,contact_phone,contact_email,payment_method,payment_phone)
 VALUES(uid,p_request,'AMA-'||upper(substr(replace(p_request::text,'-',''),1,16)),p_details->>'city',p_details->>'district',p_details->>'addressDetails',p_details->>'fullName',p_details->>'phone',p_details->>'email',p_details->>'payment',p_details->>'paymentPhone') RETURNING id INTO oid;
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
 qty:=(line->>'quantity')::integer;
 SELECT * INTO prod FROM public.products WHERE id=(line->>'productId')::uuid;
 IF prod.id IS NULL OR NOT prod.is_published OR qty IS NULL OR qty<1 OR qty>999 OR prod.stock<qty THEN RAISE EXCEPTION 'Produit indisponible ou stock insuffisant'; END IF;
 IF coalesce(line->>'color','')<>'' AND jsonb_array_length(prod.colors)>0 AND NOT prod.colors ? (line->>'color') THEN RAISE EXCEPTION 'Couleur indisponible'; END IF;
 IF coalesce(line->>'size','')<>'' AND jsonb_array_length(prod.sizes)>0 AND NOT prod.sizes ? (line->>'size') THEN RAISE EXCEPTION 'Taille indisponible'; END IF;
 UPDATE public.products SET stock=stock-qty WHERE id=prod.id;
 INSERT INTO public.order_items(order_id,product_id,product_title,unit_price_fcfa,quantity,color,size) VALUES(oid,prod.id,prod.title,prod.price_fcfa,qty,nullif(line->>'color',''),nullif(line->>'size',''));
 sub:=sub+public.product_variant_price(prod.id,nullif(line->>'color',''),nullif(line->>'size',''))*qty;
 END LOOP;
 q2:=public.prime_apply_quote(uid,public.delivery_quote_base(p_details->>'city',sub,p_details->>'district',nullif(p_details->>'agencyId','')::uuid),p_details->>'city',sub,(SELECT array_agg((value->>'productId')::uuid) FROM jsonb_array_elements(p_lines)));
 IF q2->>'mode'='agency' AND jsonb_array_length(coalesce(q2->'agencies','[]'::jsonb))>0 AND jsonb_typeof(q2->'agency') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choisissez l''agence d''expédition'; END IF;
 fee:=(q2->>'fee')::int;
 UPDATE public.orders SET shipping_mode=q2->>'mode', shipping_agency_id=nullif(q2->'agency'->>'id','')::uuid, shipping_agency_name=q2->'agency'->>'name', agency_fee_fcfa=nullif(q2->>'agency_fee','')::int, dropoff_fee_fcfa=nullif(q2->>'dropoff_fee','')::int WHERE id=oid;
 UPDATE public.orders SET shipping_fee_fcfa=fee,subtotal_fcfa=sub,total_fcfa=sub+fee WHERE id=oid;
 -- Prime : livraison incluse (payée par Amachia), abonnement et raison si non incluse — calculés ici, côté serveur
 UPDATE public.orders SET prime_delivery_included=coalesce((q2->>'prime_included')::boolean,false), prime_subscription_id=nullif(q2->>'prime_subscription_id','')::uuid, prime_delivery_cost_fcfa=CASE WHEN coalesce((q2->>'prime_included')::boolean,false) THEN (q2->>'prime_cost')::int END, shipping_note=q2->>'prime_reason' WHERE id=oid;
 -- Réduction répartie sur les articles concernés (au prorata), pour que chaque vendeur voie son montant net
 IF promo<>'' THEN
  disc:=(ev->>'discount')::int; elig:=(ev->>'eligible_subtotal')::int; left_:=disc;
  SELECT count(*) INTO n FROM public.order_items WHERE order_id=oid AND product_id IN (SELECT jsonb_array_elements_text(ev->'product_ids')::uuid);
  FOR it IN SELECT id, unit_price_fcfa*quantity AS amt FROM public.order_items
            WHERE order_id=oid AND product_id IN (SELECT jsonb_array_elements_text(ev->'product_ids')::uuid) ORDER BY id LOOP
   i:=i+1;
   part:=CASE WHEN i=n THEN left_ ELSE least(left_, round(disc*it.amt/elig::numeric)::int) END;
   left_:=left_-part;
   IF coalesce((ev->>'platform')::boolean,false) THEN UPDATE public.order_items SET platform_discount_fcfa=part WHERE id=it.id; ELSE UPDATE public.order_items SET discount_fcfa=part WHERE id=it.id; END IF;
  END LOOP;
  UPDATE public.orders SET coupon_code=ev->>'code' WHERE id=oid;
 END IF;
 -- Points récompense utilisés (au choix à la place d'un code promo)
 IF uid IS NOT NULL AND promo='' AND coalesce(nullif(p_details->>'points','')::int,0) > 0 THEN
  SELECT coalesce(sum(remaining) filter (where expires_at > now()),0) INTO bal FROM public.reward_lots(uid); -- points non expirés
  -- plafond = commission d'Amachia sur les articles (jamais plus) ; les points ne paient jamais la livraison
    SELECT least((p_details->>'points')::int, bal, greatest(0, subtotal_fcfa-discount_fcfa), public.order_points_cap(oid)) INTO use_ FROM public.orders WHERE id=oid;
  IF use_ > 0 THEN
   UPDATE public.orders SET points_used=use_, total_fcfa=greatest(0, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa-use_) WHERE id=oid;
   INSERT INTO public.reward_transactions(user_id,points,type,description,order_id) VALUES (uid,-use_,'redeem','Points utilisés pour payer la commande',oid);
  END IF;
 END IF;
 -- Les points récompense ne sont plus donnés à la commande : ils sont accordés quand le client
 -- publie un avis sur le produit commandé (voir grant_review_reward).
 IF uid IS NULL THEN UPDATE public.orders SET is_guest=true WHERE id=oid; ELSE DELETE FROM public.cart_items WHERE user_id=uid; END IF;
 RETURN oid; END $function$;

-- ---------- Cartes produits : éligibilité Prime (le site n'annonce la livraison incluse que pour les produits éligibles) ----------
-- Copie de la fonction en production + la clé is_prime.
CREATE OR REPLACE FUNCTION public.catalog_cards()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title,
    'brand', coalesce(nullif(p.brand, ''), p.specs->>'Brand', p.specs->>'Marque'),
    'price_fcfa', p.price_fcfa, 'original_price_fcfa', p.original_price_fcfa, 'stock', p.stock,
    -- 2 photos suffisent pour les listes (la 2e sert au survol)
    'images', case when jsonb_typeof(p.images) = 'array' then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(p.images) with ordinality t(e, n) where n <= 2) x) else '[]'::jsonb end,
    'sales', p.sales, 'badge', p.badge, 'category_slug', p.category_slug, 'subcategory_slug', p.subcategory_slug,
    'colors', p.colors, 'variant_prices', p.variant_prices,
    -- texte de la description (sans mise en forme), limité : sert uniquement à la recherche
    'search_text', left(regexp_replace(regexp_replace(coalesce(p.description, ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'), 400),
    'seller_flash_sales', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'value', f.value, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'is_active', f.is_active)), '[]'::jsonb)
                           from seller_flash_sales f where f.product_id = p.id and f.is_active and f.ends_at > now()),
    'sellers', (select jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug) from sellers s where s.id = p.seller_id and s.is_active),
    'is_prime', p.is_prime, 'rating_avg', r.avg, 'reviews_n', coalesce(r.n, 0)
  ) order by p.created_at), '[]'::jsonb)
  from products p
  left join lateral (select round(avg(rating)::numeric, 1) avg, count(*) n from reviews where product_id = p.id) r on true
  where p.is_published;
$function$;

-- ---------- E-mails Prime (accusé de réception de la demande, confirmation d'activation) ----------
-- Même file d'attente que les e-mails de commande (envoi par la fonction send-emails via Brevo).
alter table public.email_outbox alter column order_id drop not null;
alter table public.email_outbox add column if not exists prime_subscription_id uuid references public.prime_subscriptions(id) on delete cascade;
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in
  ('order_confirmed', 'seller_new_order', 'order_shipped', 'order_delivered', 'order_cancelled', 'prime_requested', 'prime_activated'));
create unique index if not exists email_outbox_prime_once on public.email_outbox (kind, prime_subscription_id) where prime_subscription_id is not null;

create or replace function public.prime_subscription_email() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' and new.status = 'en_attente' then
    insert into email_outbox (kind, prime_subscription_id) values ('prime_requested', new.id) on conflict do nothing;
    perform email_outbox_kick();
  elsif tg_op = 'UPDATE' and old.status = 'en_attente' and new.status = 'actif' then
    insert into email_outbox (kind, prime_subscription_id) values ('prime_activated', new.id) on conflict do nothing;
    perform email_outbox_kick();
  end if;
  return new;
end $$;
drop trigger if exists prime_subscription_email on public.prime_subscriptions;
create trigger prime_subscription_email after insert or update of status on public.prime_subscriptions
  for each row execute function public.prime_subscription_email();

-- ---------- Facture : mention « Livraison incluse avec Prime » ----------
-- Copie de la fonction en production + la clé prime_included.
CREATE OR REPLACE FUNCTION public.invoice_json(_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; inv order_invoices; s invoice_settings; p profiles;
begin
  select * into o from orders where id = _order;
  if o.id is null then raise exception 'Commande introuvable.'; end if;
  if o.status <> 'Livrée' then raise exception 'La facture est disponible une fois la commande livrée.'; end if;
  select * into inv from order_invoices where order_id = o.id;
  if inv.order_id is null then
    insert into order_invoices (order_id, number, issued_at)
    values (o.id, 'AMC-' || to_char(coalesce(o.delivered_at, now()) at time zone 'Africa/Douala', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'), coalesce(o.delivered_at, now()))
    on conflict (order_id) do nothing;
    select * into inv from order_invoices where order_id = o.id;
  end if;
  select * into s from invoice_settings where id = 1;
  select * into p from profiles where id = o.user_id;
  return jsonb_build_object(
    'number', inv.number, 'issued_at', inv.issued_at, 'order_number', o.order_number, 'ordered_at', o.created_at,
    'delivered_at', coalesce(o.delivered_at, (select max(d.delivered_at) from deliveries d where d.order_id = o.id and d.status = 'delivered')),
    'customer', jsonb_build_object(
      'name', coalesce(nullif(btrim(o.full_name), ''), p.full_name, 'Client'),
      'district', o.district, 'city', o.city,
      'address', nullif(btrim(regexp_replace(coalesce(o.address_details, ''), '\s*—?\s*GPS:\s*-?[\d.]+,\s*-?[\d.]+', '', 'i')), ''),
      'phone', coalesce(nullif(o.contact_phone, ''), p.phone), 'email', coalesce(nullif(o.contact_email, ''), p.email)),
    'sellers', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', se.name, 'city', se.city, 'slug', se.slug)), '[]'::jsonb)
      from order_items i join sellers se on se.id = i.seller_id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.product_title, 'sku', i.sku, 'color', regexp_replace(coalesce(i.color, ''), '\s*#[0-9a-fA-F]{3,8}$', ''), 'size', i.size,
        'qty', i.quantity, 'unit', i.unit_price_fcfa, 'total', i.unit_price_fcfa * i.quantity, 'seller', se.name) order by i.created_at, i.id), '[]'::jsonb)
      from order_items i left join sellers se on se.id = i.seller_id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'subtotal', o.subtotal_fcfa, 'discount', coalesce(o.discount_fcfa, 0), 'coupon', o.coupon_code, 'points', coalesce(o.points_used, 0),
    'shipping', coalesce(o.shipping_fee_fcfa, 0), 'prime_included', coalesce(o.prime_delivery_included, false), 'shipping_mode', o.shipping_mode, 'agency', o.shipping_agency_name,
    'total', o.total_fcfa, 'payment_method', o.payment_method,
    'company', to_jsonb(s) - 'id' - 'updated_at'
  );
end $function$;

-- ---------- Assistant (chatbot) : informations Prime à jour, vocabulaire « livraison incluse » ----------
-- Copie de la fonction en production ; seule la partie « prime » change (l'ancien prix unique et « livraison_gratuite » ne sont plus lus).
CREATE OR REPLACE FUNCTION public.assistant_delivery(_city text, _district text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q jsonb := delivery_quote_v2(_city, 20000, _district); s platform_settings;
begin
  select * into s from platform_settings where id = 1;
  return jsonb_build_object('ville', _city, 'quartier', _district, 'mode', case q->>'mode' when 'agency' then 'Expédition par agence de voyage' else 'Livraison à domicile par Amachia' end,
    'frais_fcfa', q->'fee', 'delai', q->>'delay_label', 'livraison_gratuite_des_fcfa', nullif((q->>'free_threshold')::int, 0),
    'agences', (select jsonb_agg(jsonb_build_object('nom', a.name, 'depot', concat_ws(', ', a.depot_district, a.depot_city), 'adresse', a.address, 'delai', a.delay_text))
                from shipping_agencies a where a.is_active and (_city = any(a.cities) or a.cities is null)),
    'prime', (select jsonb_build_object('formulation_obligatoire', 'Livraison incluse avec Prime (ne jamais dire gratuit)', 'proposee', ps.enabled, 'abonnement_des_fcfa_par_mois', (select min(round(pl.price::numeric / greatest(1, coalesce(round(pl.duration_days / 30.0), pl.months, 1)))) from prime_plans pl where pl.is_active), 'villes_a_domicile', ps.home_cities, 'agences_incluses', ps.agencies_included, 'minimum_commande_fcfa', ps.min_order_fcfa, 'livraisons_incluses_par_mois', ps.monthly_quota, 'conditions', 'https://amachia.com/legal/prime') from prime_settings ps where ps.id = 1));
end $function$;

-- ---------- Bandeau d'annonce enregistré (désactivé) : vocabulaire Prime ----------
-- Texte « Livraison gratuite avec Prime » remplacé (rien n'est supprimé ; le bandeau reste désactivé).
do $$ begin
  if to_regclass('public.site_settings') is not null then
    update public.site_settings
       set value = jsonb_set(value, '{announcement,text}', to_jsonb('Livraison incluse avec Prime — dès 2 500 FCFA/mois'::text))
     where key = 'theme' and value #>> '{announcement,text}' ilike '%gratuit%prime%';
  end if;
end $$;
