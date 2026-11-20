-- Points récompense : expiration au bout d'un mois + plafond d'utilisation par palier de prix

-- 1) Chaque gain de points expire 30 jours après avoir été gagné
alter table public.reward_transactions add column if not exists expires_at timestamptz;
alter table public.reward_transactions add column if not exists expiry_done boolean not null default false;
create or replace function public.reward_set_expiry() returns trigger language plpgsql as $$
begin
  if new.points > 0 and new.expires_at is null then new.expires_at := coalesce(new.created_at, now()) + interval '30 days'; end if;
  return new;
end $$;
drop trigger if exists reward_set_expiry on public.reward_transactions;
create trigger reward_set_expiry before insert on public.reward_transactions for each row execute function public.reward_set_expiry();
-- points déjà gagnés : un mois complet à partir de la mise en place de la règle
update public.reward_transactions set expires_at = greatest(created_at + interval '30 days', now() + interval '30 days')
where points > 0 and expires_at is null;

-- 2) Lots de points encore disponibles d'un client (les dépenses consomment d'abord les points les plus anciens)
create or replace function public.reward_lots(_uid uuid)
returns table (id uuid, earned_at timestamptz, expires_at timestamptz, amount int, remaining int, expiry_done boolean)
language sql stable security definer set search_path = public as $$
  with debit as (select coalesce(-sum(points), 0) as total from reward_transactions where user_id = _uid and points < 0),
  grants as (
    select r.id, r.created_at, r.expires_at, r.points, r.expiry_done,
      coalesce(sum(r.points) over (order by r.created_at, r.id rows between unbounded preceding and 1 preceding), 0) as before
    from reward_transactions r where r.user_id = _uid and r.points > 0)
  select g.id, g.created_at, g.expires_at, g.points,
    (g.points - least(g.points, greatest(0, (select total from debit) - g.before)))::int,
    g.expiry_done
  from grants g order by g.created_at, g.id;
$$;
revoke all on function public.reward_lots(uuid) from public, anon, authenticated;

-- 3) Expiration : retire la part non utilisée des points arrivés à échéance (lancé toutes les heures)
create or replace function public.expire_reward_points() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid; l record; n int := 0;
begin
  for u in select distinct user_id from reward_transactions where points > 0 and not expiry_done and expires_at <= now() loop
    for l in select * from reward_lots(u) where not expiry_done and expires_at <= now() order by earned_at loop
      if l.remaining > 0 then
        insert into reward_transactions (user_id, points, type, description)
        values (u, -l.remaining, 'expiry', 'Points expirés (gagnés le ' || to_char(l.earned_at at time zone 'Africa/Douala', 'DD/MM/YYYY') || ', non utilisés en 1 mois)');
        n := n + 1;
      end if;
      update reward_transactions set expiry_done = true where id = l.id;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.expire_reward_points() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'expire-reward-points';
select cron.schedule('expire-reward-points', '7 * * * *', 'select public.expire_reward_points()');

-- 4) Solde (points expirés exclus même entre deux passages de l'expiration)
create or replace function public.customer_points_balance() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining) filter (where expires_at > now()), 0)::int from reward_lots(auth.uid());
$$;

-- Détail pour « Mon compte » : solde et prochaines échéances
create or replace function public.customer_points_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce(sum(remaining) filter (where expires_at > now()), 0),
    'lots', coalesce(jsonb_agg(jsonb_build_object('points', remaining, 'earned_at', earned_at, 'expires_at', expires_at) order by expires_at)
                      filter (where remaining > 0 and expires_at > now()), '[]'::jsonb))
  from reward_lots(auth.uid());
$$;
grant execute on function public.customer_points_status() to authenticated;

-- 5) Plafond d'utilisation des points selon le montant des produits (le client paie toujours une partie)
create or replace function public.points_usage_rate(_amount numeric) returns numeric
language sql immutable as $$
  select case when _amount <= 10000 then 0.25 when _amount <= 50000 then 0.20 when _amount <= 200000 then 0.15 else 0.10 end;
$$;
create or replace function public.points_usage_cap(_amount numeric) returns int
language sql immutable as $$
  select greatest(0, floor(coalesce(_amount, 0) * public.points_usage_rate(coalesce(_amount, 0))))::int;
$$;
grant execute on function public.points_usage_rate(numeric), public.points_usage_cap(numeric) to anon, authenticated;

-- 6) Paiement : points non expirés et plafond par palier
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
  -- plafond par palier : 25 % des produits jusqu'à 10 000 FCFA, 20 % jusqu'à 50 000, 15 % jusqu'à 200 000, 10 % au-delà
    SELECT least((p_details->>'points')::int, bal, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa, public.points_usage_cap(subtotal_fcfa)) INTO use_ FROM public.orders WHERE id=oid;
  IF use_ > 0 THEN
   UPDATE public.orders SET points_used=use_, total_fcfa=greatest(0, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa-use_) WHERE id=oid;
   INSERT INTO public.reward_transactions(user_id,points,type,description,order_id) VALUES (uid,-use_,'redeem','Points utilisés pour payer la commande',oid);
  END IF;
 END IF;
 -- Les points récompense ne sont plus donnés à la commande : ils sont accordés quand le client
 -- publie un avis sur le produit commandé (voir grant_review_reward).
 IF uid IS NULL THEN UPDATE public.orders SET is_guest=true WHERE id=oid; ELSE DELETE FROM public.cart_items WHERE user_id=uid; END IF;
 RETURN oid; END $function$;
