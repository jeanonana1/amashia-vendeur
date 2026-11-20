-- Agences d'expédition : tarif par ville desservie, quartier de dépôt (Yaoundé / Douala) et
-- frais de livraison jusqu'à l'agence ajoutés au prix payé par le client (hors Yaoundé / Douala).
alter table public.shipping_agencies
  add column if not exists city_fees jsonb not null default '{}'::jsonb,
  add column if not exists depot_city text,
  add column if not exists depot_district text;
alter table public.orders
  add column if not exists agency_fee_fcfa int,
  add column if not exists dropoff_fee_fcfa int;

-- Livraison par Amachia du colis jusqu'à l'agence : même prix qu'une livraison client dans ce quartier.
create or replace function public.agency_dropoff_fee(_city text, _district text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select d.fee from cm_districts d where d.is_active and lower(d.city) = lower(btrim(coalesce(_city, ''))) and lower(d.name) = lower(btrim(coalesce(_district, ''))) limit 1),
    (select z.fee from delivery_zones z where z.is_active and lower(btrim(z.city)) = lower(btrim(coalesce(_city, ''))) limit 1),
    (select s.shipping_fee from platform_settings s where s.id = 1), 0)::int;
$$;

-- Tarif de l'agence pour une ville : tarif propre à la ville s'il existe, sinon tarif général.
create or replace function public.agency_city_fee(_a public.shipping_agencies, _city text) returns int
language sql stable set search_path = public as $$
  select coalesce((select (e.value)::int from jsonb_each_text(coalesce(_a.city_fees, '{}'::jsonb)) e where lower(e.key) = lower(btrim(coalesce(_city, ''))) limit 1), _a.fee);
$$;

CREATE OR REPLACE FUNCTION public.delivery_quote_v2(_city text, _subtotal integer, _district text DEFAULT NULL::text, _agency uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s public.platform_settings; z public.delivery_zones; d public.cm_districts; a public.shipping_agencies;
  fee int; thr int; prime boolean := false; reg text := public.cm_region_of(_city); ags jsonb; afee int; dfee int;
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
  -- hors Yaoundé / Douala : livraison par Amachia jusqu'à l'agence + expédition par l'agence vers la ville du client
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
    'prime', false, 'free_threshold', 0,
    'delay_label', 'Selon l''agence d''expédition choisie', 'days', null);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_agency(_a jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_a->>'id', '')::uuid; regs text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'regions', '[]'))), '{}');
  cts text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'cities', '[]'))), '{}');
  cf jsonb := '{}'::jsonb; e record;
begin
  perform public.admin_guard('admin_save_agency');
  if coalesce(btrim(_a->>'name'), '') = '' then raise exception 'Indiquez le nom de l''agence.'; end if;
  if cardinality(regs) = 0 then raise exception 'Choisissez au moins une région desservie.'; end if;
  if coalesce((_a->>'fee')::int, -1) < 0 then raise exception 'Indiquez le tarif général d''expédition.'; end if;
  if coalesce(btrim(_a->>'depot_district'), '') = '' then raise exception 'Indiquez le quartier où se trouve l''agence (ex. Mvan).'; end if;
  -- tarifs par ville : uniquement des villes desservies, montants positifs
  for e in select key, value from jsonb_each_text(coalesce(_a->'city_fees', '{}'::jsonb)) loop
    if nullif(btrim(e.value), '') is null then continue; end if;
    if e.value !~ '^\d+$' then raise exception 'Tarif invalide pour %.', e.key; end if;
    cf := cf || jsonb_build_object(btrim(e.key), e.value::int);
  end loop;
  if rid is null then
    insert into shipping_agencies (name, phone, address, regions, cities, fee, city_fees, depot_city, depot_district, delay_text, notes, is_active)
    values (btrim(_a->>'name'), nullif(btrim(_a->>'phone'), ''), nullif(btrim(_a->>'address'), ''), regs, cts, (_a->>'fee')::int, cf,
      coalesce(nullif(btrim(_a->>'depot_city'), ''), 'Yaoundé'), btrim(_a->>'depot_district'),
      nullif(btrim(_a->>'delay_text'), ''), nullif(btrim(_a->>'notes'), ''), coalesce((_a->>'is_active')::boolean, true)) returning id into rid;
  else
    update shipping_agencies set name = btrim(_a->>'name'), phone = nullif(btrim(_a->>'phone'), ''), address = nullif(btrim(_a->>'address'), ''),
      regions = regs, cities = cts, fee = (_a->>'fee')::int, city_fees = cf,
      depot_city = coalesce(nullif(btrim(_a->>'depot_city'), ''), 'Yaoundé'), depot_district = btrim(_a->>'depot_district'),
      delay_text = nullif(btrim(_a->>'delay_text'), ''), notes = nullif(btrim(_a->>'notes'), ''),
      is_active = coalesce((_a->>'is_active')::boolean, is_active), updated_at = now() where id = rid;
  end if;
  return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_agencies()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  perform public.admin_guard('admin_agencies');
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'dropoff_fee', public.agency_dropoff_fee(coalesce(a.depot_city, 'Yaoundé'), a.depot_district),
      'orders', (select count(*) from orders o where o.shipping_agency_id = a.id and o.status <> 'Annulée'),
      -- frais versés à l'agence (hors livraison jusqu'à l'agence, qui revient à Amachia)
      'fees_total', (select coalesce(sum(coalesce(o.agency_fee_fcfa, o.shipping_fee_fcfa - coalesce(o.dropoff_fee_fcfa, 0))), 0) from orders o where o.shipping_agency_id = a.id and o.status <> 'Annulée'),
      'dropoff_total', (select coalesce(sum(o.dropoff_fee_fcfa), 0) from orders o where o.shipping_agency_id = a.id and o.status <> 'Annulée'))
    order by a.sort, a.name) from shipping_agencies a), '[]'::jsonb);
end $function$;

-- Paiement : le détail (part agence / livraison jusqu'à l'agence) est conservé sur la commande.
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
 q2:=public.delivery_quote_v2(p_details->>'city',sub,p_details->>'district',nullif(p_details->>'agencyId','')::uuid);
 IF q2->>'mode'='agency' AND jsonb_array_length(coalesce(q2->'agencies','[]'::jsonb))>0 AND jsonb_typeof(q2->'agency') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choisissez l''agence d''expédition'; END IF;
 fee:=(q2->>'fee')::int;
 UPDATE public.orders SET shipping_mode=q2->>'mode', shipping_agency_id=nullif(q2->'agency'->>'id','')::uuid, shipping_agency_name=q2->'agency'->>'name', agency_fee_fcfa=nullif(q2->>'agency_fee','')::int, dropoff_fee_fcfa=nullif(q2->>'dropoff_fee','')::int WHERE id=oid;
 UPDATE public.orders SET shipping_fee_fcfa=fee,subtotal_fcfa=sub,total_fcfa=sub+fee WHERE id=oid;
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
  SELECT coalesce(sum(points),0) INTO bal FROM public.reward_transactions WHERE user_id=uid;
  SELECT least((p_details->>'points')::int, bal, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa) INTO use_ FROM public.orders WHERE id=oid;
  IF use_ > 0 THEN
   UPDATE public.orders SET points_used=use_, total_fcfa=greatest(0, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa-use_) WHERE id=oid;
   INSERT INTO public.reward_transactions(user_id,points,type,description,order_id) VALUES (uid,-use_,'redeem','Points utilisés pour payer la commande',oid);
  END IF;
 END IF;
 -- Les points récompense ne sont plus donnés à la commande : ils sont accordés quand le client
 -- publie un avis sur le produit commandé (voir grant_review_reward).
 IF uid IS NULL THEN UPDATE public.orders SET is_guest=true WHERE id=oid; ELSE DELETE FROM public.cart_items WHERE user_id=uid; END IF;
 RETURN oid; END $function$;
