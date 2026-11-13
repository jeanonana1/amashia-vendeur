-- =====================================================================
-- Prix par valeur d'attribut (ex. chaussures : Noir 15 000, Blanc 17 000 ;
-- Taille 45 : 18 000). Le vendeur saisit un prix facultatif par valeur ;
-- s'il en a fixé pour plusieurs attributs choisis, le plus élevé s'applique.
-- La base recalcule toujours le prix de chaque ligne de commande.
-- =====================================================================

alter table public.products add column if not exists variant_prices jsonb not null default '[]'::jsonb;

-- [{attr, value, price}] à partir des attributs du vendeur ({name, values, prices:{valeur: prix}})
create or replace function public.seller_variant_prices(_attrs jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'attr', case when lower(translate(trim(a->>'name'), 'éèêÉÈÊ', 'eeeeee')) in ('couleur','couleurs','color','colour','colors') then 'Couleur' else trim(a->>'name') end,
      'value', p.key,
      'price', round((p.value #>> '{}')::numeric)::int)), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(_attrs) = 'array' then _attrs else '[]'::jsonb end) a,
       jsonb_each(case when jsonb_typeof(a->'prices') = 'object' then a->'prices' else '{}'::jsonb end) p
  where coalesce(trim(a->>'name'), '') <> ''
    and (p.value #>> '{}') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
    and (p.value #>> '{}')::numeric > 0
    and a->'values' ? p.key;
$$;

-- Prix réel d'un article selon la couleur et les options choisies
-- (_options au format du site : « Taille : M · Matière : Cuir »)
create or replace function public.product_variant_price(_product uuid, _color text, _options text)
returns integer language sql stable security definer set search_path = public as $$
  with p as (select price_fcfa, variant_prices from public.products where id = _product),
  opts as (
    select lower(trim(split_part(o, ' : ', 1))) as name, lower(trim(substr(o, strpos(o, ' : ') + 3))) as val
    from unnest(string_to_array(coalesce(_options, ''), ' · ')) o
    where strpos(o, ' : ') > 0
  )
  select coalesce((
    select max((vp->>'price')::int)
    from p, jsonb_array_elements(p.variant_prices) vp
    where (vp->>'attr' = 'Couleur' and lower(trim(vp->>'value')) = lower(trim(coalesce(_color, ''))))
       or (vp->>'attr' <> 'Couleur' and exists (select 1 from opts where opts.name = lower(trim(vp->>'attr')) and opts.val = lower(trim(vp->>'value'))))
  ), (select price_fcfa from p));
$$;
grant execute on function public.product_variant_price(uuid, text, text) to anon, authenticated;

-- Le prix d'une ligne de commande tient compte de la variante choisie
create or replace function public.enforce_order_item_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select title, price_fcfa, seller_id into p from public.products where id = new.product_id;
  if p is null then raise exception 'Produit introuvable'; end if;
  new.unit_price_fcfa := public.product_variant_price(new.product_id, new.color, new.size);
  new.product_title := p.title;
  new.seller_id := p.seller_id;
  return new;
end $$;

-- Publication : prix des variantes
CREATE OR REPLACE FUNCTION public.seller_product_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
  publishable boolean;
  specs_obj jsonb;
  v_groups jsonb;
  v_colors jsonb;
  v_attrs jsonb;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  publishable := new.status = 'active'
    and coalesce(trim(new.name), '') <> ''
    and coalesce(new.price, 0) > 0
    and coalesce(array_length(new.images, 1), 0) > 0;

  if new.marketplace_product_id is null and not publishable then
    return new;
  end if;

  sid := public.ensure_seller_for(new.user_id);

  select coalesce(jsonb_object_agg(s->>'name', coalesce(s->>'value', '')), '{}'::jsonb)
    into specs_obj
  from jsonb_array_elements(case when jsonb_typeof(new.specifications) = 'array' then new.specifications else '[]'::jsonb end) s
  where coalesce(trim(s->>'name'), '') <> '';

  v_groups := public.seller_variant_groups(new.variant_images);
  select coalesce(jsonb_agg(distinct c), '[]'::jsonb) into v_colors
  from (
    select jsonb_array_elements_text(public.seller_attribute_values(new.attributes, array['couleur', 'couleurs', 'color', 'colour', 'colors'])) c
    union
    select g->>'label' from jsonb_array_elements(v_groups) g
  ) x;
  v_attrs := public.seller_other_attributes(new.attributes);

  if new.marketplace_product_id is null then
    insert into public.products (
      seller_id, category_slug, title, description, price_fcfa, original_price_fcfa,
      stock, images, specs, features, colors, sizes, variant_images, attributes, variant_prices, is_published
    ) values (
      sid, public.seller_category_slug(new.category), new.name, new.description,
      round(new.price)::int,
      case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      greatest(new.stock, 0), to_jsonb(coalesce(new.images, '{}')), specs_obj, '[]'::jsonb,
      v_colors, '[]'::jsonb, v_groups, v_attrs, public.seller_variant_prices(new.attributes), true
    )
    returning id into new.marketplace_product_id;
    new.published_at := now();
  else
    update public.products set
      seller_id = sid,
      category_slug = public.seller_category_slug(new.category),
      title = case when coalesce(trim(new.name), '') <> '' then new.name else title end,
      description = new.description,
      price_fcfa = case when coalesce(new.price, 0) > 0 then round(new.price)::int else price_fcfa end,
      original_price_fcfa = case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      stock = greatest(new.stock, 0),
      images = case when coalesce(array_length(new.images, 1), 0) > 0 then to_jsonb(new.images) else images end,
      specs = specs_obj,
      colors = v_colors,
      sizes = '[]'::jsonb,
      variant_images = v_groups,
      attributes = v_attrs,
      variant_prices = public.seller_variant_prices(new.attributes),
      is_published = publishable
    where id = new.marketplace_product_id;
    if publishable and new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $function$;

-- Commande : sous-total au prix des variantes
CREATE OR REPLACE FUNCTION public.customer_checkout(p_request uuid, p_lines jsonb, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid(); oid uuid; line jsonb; prod public.products%rowtype; qty integer; sub integer:=0; fee integer; promo text:=upper(btrim(coalesce(p_details->>'promo',''))); ev jsonb; disc integer:=0; elig integer; left_ integer; n integer; i integer:=0; it record; part integer; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 SELECT id INTO oid FROM public.orders WHERE user_id=uid AND request_key=p_request; IF oid IS NOT NULL THEN RETURN oid; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Panier invalide'; END IF;
 IF coalesce(p_details->>'city','')='' OR coalesce(p_details->>'district','')='' OR coalesce(p_details->>'fullName','')='' OR coalesce(p_details->>'phone','')='' THEN RAISE EXCEPTION 'Adresse et coordonnées requises'; END IF;
 IF coalesce(p_details->>'payment','') NOT IN ('Paiement à la livraison','Orange Money','Mobile Money','Carte bancaire') THEN RAISE EXCEPTION 'Paiement invalide'; END IF;
 -- Coupon vendeur : verrouillé pour respecter le nombre maximum d'utilisations
 IF promo<>'' THEN
  PERFORM 1 FROM public.seller_coupons WHERE upper(code)=promo FOR UPDATE;
  ev:=public.coupon_eval(promo,p_lines,uid);
  IF NOT coalesce((ev->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Code promotionnel : %', ev->>'message'; END IF;
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
 fee:=CASE WHEN sub>50000 THEN 0 ELSE 1500 END;
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
   UPDATE public.order_items SET discount_fcfa=part WHERE id=it.id;
  END LOOP;
  UPDATE public.orders SET coupon_code=ev->>'code' WHERE id=oid;
 END IF;
 -- Les points récompense ne sont plus donnés à la commande : ils sont accordés quand le client
 -- publie un avis sur le produit commandé (voir grant_review_reward).
 DELETE FROM public.cart_items WHERE user_id=uid;
 RETURN oid; END $function$;

-- Coupons : montant éligible au prix des variantes
CREATE OR REPLACE FUNCTION public.coupon_eval(_code text, _lines jsonb, _uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.seller_coupons%rowtype; shop text; eligible integer := 0; ids uuid[] := '{}'; disc integer; line jsonb; p record; qty integer;
begin
  select * into c from public.seller_coupons where upper(code) = upper(btrim(coalesce(_code, '')));
  if c.id is null then return jsonb_build_object('ok', false, 'message', 'Ce code promo n''existe pas.'); end if;
  select name into shop from public.sellers where id = c.seller_id and is_active;
  if shop is null or not c.is_active then return jsonb_build_object('ok', false, 'message', 'Ce coupon n''est plus actif.'); end if;
  if c.starts_at > now() then return jsonb_build_object('ok', false, 'message', 'Ce coupon n''est pas encore valable.'); end if;
  if c.ends_at is not null and c.ends_at < now() then return jsonb_build_object('ok', false, 'message', 'Ce coupon a expiré.'); end if;
  if c.max_uses is not null and public.coupon_uses(c.code) >= c.max_uses then
    return jsonb_build_object('ok', false, 'message', 'Ce coupon a atteint son nombre maximum d''utilisations.');
  end if;
  if _uid is not null and exists (select 1 from public.orders where user_id = _uid and coupon_code = c.code and status <> 'Annulée') then
    return jsonb_build_object('ok', false, 'message', 'Vous avez déjà utilisé ce coupon.');
  end if;
  if jsonb_typeof(_lines) = 'array' then
    for line in select value from jsonb_array_elements(_lines) loop
      qty := greatest(1, least(999, coalesce((line->>'quantity')::int, 1)));
      select id, price_fcfa, seller_id into p from public.products
        where is_published and (id::text = line->>'productId' or slug = line->>'productId');
      if p.id is not null and p.seller_id = c.seller_id and (c.product_id is null or c.product_id = p.id) then
        eligible := eligible + public.product_variant_price(p.id, nullif(line->>'color', ''), nullif(line->>'size', '')) * qty;
        ids := ids || p.id;
      end if;
    end loop;
  end if;
  if eligible = 0 then
    return jsonb_build_object('ok', false, 'message',
      case when c.product_id is not null then 'Ce coupon ne concerne pas les articles de votre panier.'
           else 'Ce coupon est réservé aux articles de la boutique ' || shop || '.' end);
  end if;
  if eligible < c.min_order_fcfa then
    return jsonb_build_object('ok', false, 'message', 'Ce coupon demande au moins ' || to_char(c.min_order_fcfa, 'FM999G999G999') || ' FCFA d''achat chez ' || shop || '.');
  end if;
  disc := case when c.kind = 'percent' then round(eligible * c.value / 100.0)::int else least(c.value, eligible) end;
  return jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'value', c.value, 'discount', disc,
    'eligible_subtotal', eligible, 'product_ids', to_jsonb(ids), 'seller_name', shop,
    'scope', case when c.product_id is null then 'shop' else 'product' end, 'ends_at', c.ends_at);
end $function$;

-- Produits déjà publiés : prix des variantes recalculés
update public.products p set variant_prices = public.seller_variant_prices(sp.attributes)
  from public.seller_products sp where sp.marketplace_product_id = p.id;
