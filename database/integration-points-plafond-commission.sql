-- Points récompense : plafond = commission d'Amachia sur la commande (règle unique, plus de paliers).
-- Le vendeur est payé en entier ; la réduction en points est prise sur la commission. Les points ne paient jamais la livraison.
-- S'applique aux nouvelles commandes uniquement (les commandes passées ne sont pas modifiées).
begin;

-- commission d'Amachia sur les articles d'une commande = points utilisables au maximum
create or replace function public.order_points_cap(_order uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.item_commission(i.unit_price_fcfa, i.quantity, coalesce(i.discount_fcfa, 0) + coalesce(i.platform_discount_fcfa, 0), i.commission_pct)), 0)::int
  from public.order_items i where i.order_id = _order;
$$;
revoke all on function public.order_points_cap(uuid) from public, anon, authenticated;

-- aperçu sur la page de paiement : mêmes calculs, à partir du panier [{product, price, qty}]
create or replace function public.points_cap_preview(_lines jsonb)
returns integer language sql stable security definer set search_path = public as $$
  select case when not public.commissions_enabled() then 0 else coalesce(sum(
    public.item_commission(greatest(0, coalesce((l->>'price')::numeric, 0))::int, greatest(1, coalesce((l->>'qty')::int, 1)), 0, coalesce(c.commission_pct, 0))), 0)::int end
  from jsonb_array_elements(coalesce(_lines, '[]'::jsonb)) l
  join public.products p on p.id::text = l->>'product' or p.slug = l->>'product'
  left join public.categories c on c.slug = p.category_slug;
$$;
grant execute on function public.points_cap_preview(jsonb) to anon, authenticated;

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

commit;
