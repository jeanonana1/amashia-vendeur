-- =====================================================================
-- Amashia : nouvelles commandes vendeur, avis réservés aux acheteurs,
-- points récompense accordés après un avis.
-- =====================================================================
begin;

-- 0. Points récompense liés à un produit (un seul versement par produit et par commande)
alter table public.reward_transactions add column if not exists product_id uuid;
create unique index if not exists reward_transactions_review_once on public.reward_transactions(order_id, product_id) where product_id is not null;

-- 1. Dernière consultation des commandes par le vendeur
alter table public.seller_profiles add column if not exists orders_seen_at timestamptz;

create or replace function public.mark_orders_seen()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare prev timestamptz;
begin
  select orders_seen_at into prev from seller_profiles where id = auth.uid();
  update seller_profiles set orders_seen_at = now() where id = auth.uid();
  return prev; -- date de la visite précédente (pour marquer les commandes « Nouveau »)
end $$;
revoke execute on function public.mark_orders_seen() from public, anon;
grant execute on function public.mark_orders_seen() to authenticated;

create or replace function public.seller_new_orders_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(distinct oi.order_id)::int
  from order_items oi join sellers s on s.id = oi.seller_id
  left join seller_profiles sp on sp.id = s.owner_id
  where s.owner_id = auth.uid() and oi.created_at > coalesce(sp.orders_seen_at, '-infinity'::timestamptz)
$$;
revoke execute on function public.seller_new_orders_count() from public, anon;
grant execute on function public.seller_new_orders_count() to authenticated;

-- 2. Avis : uniquement pour un produit réellement commandé (commande non annulée)
create or replace function public.mark_verified_purchase()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.rating < 1 or new.rating > 5 then raise exception 'Note entre 1 et 5 requise'; end if;
  if jsonb_typeof(new.photos) <> 'array' or jsonb_array_length(new.photos) > 2 or length(new.photos::text) > 6000000 then raise exception 'Photos invalides'; end if;
  new.is_verified_purchase := exists (
    select 1 from order_items oi join orders o on o.id = oi.order_id
    where oi.product_id = new.product_id and o.user_id = new.user_id and o.status <> 'Annulée'
  );
  if not new.is_verified_purchase then
    raise exception 'Seuls les clients ayant commandé ce produit peuvent donner un avis';
  end if;
  return new;
end $fn$;

create or replace function public.can_review(_product uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'purchased', exists (select 1 from order_items oi join orders o on o.id = oi.order_id
                         where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'),
    'points', coalesce((select sum(round(oi.unit_price_fcfa * coalesce(oi.quantity, 1) * 0.01))::int
                        from order_items oi join orders o on o.id = oi.order_id
                        where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'
                          and not exists (select 1 from reward_transactions rt where rt.order_id = o.id and rt.product_id = _product)), 0)
  )
$$;
grant execute on function public.can_review(uuid) to anon, authenticated;

-- 3. Points récompense : 1 % du montant de l'article, accordés au premier avis

create or replace function public.grant_review_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into reward_transactions (user_id, points, type, description, order_id, product_id)
  select new.user_id, round(oi.unit_price_fcfa * coalesce(oi.quantity, 1) * 0.01)::int, 'cashback',
         'Points pour votre avis : ' || left(oi.product_title, 60) || ' (commande ' || o.order_number || ')', o.id, new.product_id
  from order_items oi join orders o on o.id = oi.order_id
  where oi.product_id = new.product_id and o.user_id = new.user_id and o.status <> 'Annulée'
    and round(oi.unit_price_fcfa * coalesce(oi.quantity, 1) * 0.01) > 0
  on conflict do nothing;
  return null;
end $$;
revoke execute on function public.grant_review_reward() from public, anon, authenticated;
drop trigger if exists review_reward on public.reviews;
create trigger review_reward after insert on public.reviews for each row execute function public.grant_review_reward();

-- 4. Commande : plus de points accordés au moment de l'achat
CREATE OR REPLACE FUNCTION public.customer_checkout(p_request uuid, p_lines jsonb, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid(); oid uuid; line jsonb; prod public.products%rowtype; qty integer; sub integer:=0; fee integer; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT id INTO oid FROM public.orders WHERE user_id=uid AND request_key=p_request; IF oid IS NOT NULL THEN RETURN oid; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Panier invalide'; END IF;
 IF coalesce(p_details->>'city','')='' OR coalesce(p_details->>'district','')='' OR coalesce(p_details->>'fullName','')='' OR coalesce(p_details->>'phone','')='' THEN RAISE EXCEPTION 'Adresse et coordonnées requises'; END IF;
 IF coalesce(p_details->>'payment','') NOT IN ('Paiement à la livraison','Orange Money','Mobile Money','Carte bancaire') THEN RAISE EXCEPTION 'Paiement invalide'; END IF;
 IF p_details->>'promo' IS NOT NULL AND p_details->>'promo'<>'' THEN RAISE EXCEPTION 'Code promotionnel non disponible'; END IF;
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
 sub:=sub+prod.price_fcfa*qty;
 END LOOP;
 fee:=CASE WHEN sub>50000 THEN 0 ELSE 1500 END;
 UPDATE public.orders SET shipping_fee_fcfa=fee,subtotal_fcfa=sub,total_fcfa=sub+fee WHERE id=oid;
 -- Les points récompense ne sont plus donnés à la commande : ils sont accordés quand le client
 -- publie un avis sur le produit commandé (voir grant_review_reward).
 DELETE FROM public.cart_items WHERE user_id=uid;
 RETURN oid; END $function$;

commit;
