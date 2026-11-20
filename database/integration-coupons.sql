-- =====================================================================
-- Coupons de réduction créés par les vendeurs (espace Promotions).
-- Seuls ces coupons sont acceptés au paiement. Un coupon vaut pour un
-- produit précis ou pour toute la boutique ; la réduction ne s'applique
-- qu'aux articles de ce vendeur et elle est déduite de ses montants.
-- =====================================================================

alter table public.order_items add column if not exists discount_fcfa integer not null default 0;
alter table public.orders add column if not exists discount_fcfa integer not null default 0;
alter table public.orders add column if not exists coupon_code text;

create table if not exists public.seller_coupons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  product_id uuid references public.products(id) on delete cascade,
  min_order_fcfa integer not null default 0 check (min_order_fcfa >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90)
);
create unique index if not exists seller_coupons_code_key on public.seller_coupons (upper(code));
create index if not exists seller_coupons_seller_idx on public.seller_coupons (seller_id);
create index if not exists seller_coupons_product_idx on public.seller_coupons (product_id);
create index if not exists orders_coupon_idx on public.orders (coupon_code) where coupon_code is not null;

alter table public.seller_coupons enable row level security;
drop policy if exists "coupons: le vendeur gère les siens" on public.seller_coupons;
create policy "coupons: le vendeur gère les siens" on public.seller_coupons
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.seller_coupons from anon;
grant select, insert, update, delete on public.seller_coupons to authenticated;

-- Contrôles à l'enregistrement : boutique du vendeur connecté, code propre, produit du vendeur
create or replace function public.seller_coupon_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from public.sellers where owner_id = auth.uid() limit 1;
  if sid is null then raise exception 'Boutique introuvable : complétez d''abord votre boutique.'; end if;
  if tg_op = 'UPDATE' and old.owner_id <> auth.uid() then raise exception 'Coupon introuvable'; end if;
  new.owner_id := auth.uid();
  new.seller_id := sid;
  new.code := upper(btrim(new.code));
  if new.code !~ '^[A-Z0-9_-]{3,20}$' then
    raise exception 'Le code doit contenir 3 à 20 lettres ou chiffres, sans espace.';
  end if;
  if new.product_id is not null and not exists (select 1 from public.products where id = new.product_id and seller_id = sid) then
    raise exception 'Ce produit n''appartient pas à votre boutique.';
  end if;
  if new.ends_at is not null and new.ends_at <= new.starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists seller_coupon_guard on public.seller_coupons;
create trigger seller_coupon_guard before insert or update on public.seller_coupons
  for each row execute function public.seller_coupon_guard();

-- Nombre d'utilisations (commandes non annulées)
create or replace function public.coupon_uses(_code text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.orders where coupon_code = upper(_code) and status <> 'Annulée';
$$;
revoke all on function public.coupon_uses(text) from public, anon, authenticated;

-- Calcul d'une réduction pour un panier. _lines = [{productId, quantity}]
create or replace function public.coupon_eval(_code text, _lines jsonb, _uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        eligible := eligible + p.price_fcfa * qty;
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
end $$;
revoke all on function public.coupon_eval(text, jsonb, uuid) from public, anon, authenticated;

-- Vérification publique d'un code (page de paiement)
create or replace function public.quote_coupon(_code text, _lines jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.coupon_eval(_code, _lines, auth.uid());
$$;
grant execute on function public.quote_coupon(text, jsonb) to anon, authenticated;

-- Coupons visibles sur une fiche produit
create or replace function public.product_coupons(_product uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'kind', c.kind, 'value', c.value, 'min_order_fcfa', c.min_order_fcfa,
      'ends_at', c.ends_at, 'scope', case when c.product_id is null then 'shop' else 'product' end)
      order by (c.product_id is null), c.value desc), '[]'::jsonb)
  from public.seller_coupons c
  join public.products p on p.id = _product and p.is_published
  join public.sellers s on s.id = c.seller_id and s.is_active
  where c.seller_id = p.seller_id and (c.product_id is null or c.product_id = p.id)
    and c.is_active and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
    and (c.max_uses is null or public.coupon_uses(c.code) < c.max_uses);
$$;
grant execute on function public.product_coupons(uuid) to anon, authenticated;

-- Coupons du vendeur avec leurs résultats (espace Promotions)
create or replace function public.seller_coupons_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'kind', c.kind, 'value', c.value, 'product_id', c.product_id,
      'product_title', p.title, 'product_image', p.images->>0, 'min_order_fcfa', c.min_order_fcfa,
      'max_uses', c.max_uses, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'is_active', c.is_active,
      'created_at', c.created_at,
      'uses', (select count(*) from public.orders o where o.coupon_code = c.code and o.status <> 'Annulée'),
      'discount_total', (select coalesce(sum(oi.discount_fcfa), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
                          where o.coupon_code = c.code and o.status <> 'Annulée' and oi.seller_id = c.seller_id),
      'revenue', (select coalesce(sum(oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
                   where o.coupon_code = c.code and o.status <> 'Annulée' and oi.seller_id = c.seller_id)
    ) order by c.created_at desc), '[]'::jsonb)
  from public.seller_coupons c left join public.products p on p.id = c.product_id
  where c.owner_id = auth.uid();
$$;
grant execute on function public.seller_coupons_list() to authenticated;

-- Totaux de commande : la réduction est déduite
create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid; sub integer; disc integer;
begin
  oid := coalesce(new.order_id, old.order_id);
  select coalesce(sum(unit_price_fcfa * quantity), 0), coalesce(sum(discount_fcfa), 0) into sub, disc
    from public.order_items where order_id = oid;
  update public.orders set subtotal_fcfa = sub, discount_fcfa = disc, total_fcfa = greatest(0, sub + shipping_fee_fcfa - disc) where id = oid;
  return null;
end $$;

-- Vue des ventes du vendeur : montant net + réduction accordée
create or replace view public.seller_orders with (security_invoker = true) as
 SELECT oi.id, o.order_number, oi.product_id AS listing_id, sp.id AS product_id, s.owner_id AS seller_id,
    COALESCE(NULLIF(TRIM(BOTH FROM o.full_name), ''::text), 'Client Amachia'::text) AS customer_name,
    concat_ws(', '::text, NULLIF(o.district, ''::text), NULLIF(o.city, ''::text)) AS delivery_area,
    oi.product_title, oi.quantity, oi.unit_price_fcfa AS unit_price,
    (oi.unit_price_fcfa * COALESCE(oi.quantity, 1) - oi.discount_fcfa) AS amount,
    COALESCE(o.payment_method, 'À la livraison'::text) AS payment_method, false AS paid,
    CASE WHEN (o.status = 'Annulée'::text) THEN 'cancelled'::text ELSE oi.seller_status END AS status,
    oi.created_at, oi.color, oi.size AS options,
    (SELECT (p.images ->> 0) FROM products p WHERE (p.id = oi.product_id)) AS product_image,
    o.id AS order_id,
    oi.discount_fcfa AS discount,
    o.coupon_code
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN sellers s ON s.id = oi.seller_id
     LEFT JOIN seller_products sp ON sp.marketplace_product_id = oi.product_id
  WHERE s.owner_id = auth.uid();
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
 sub:=sub+prod.price_fcfa*qty;
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
-- seller_dashboard_stats : montants nets de la réduction (1 endroit(s))
CREATE OR REPLACE FUNCTION public.seller_dashboard_stats(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
  d int := case when _days in (1, 7, 30, 365) then _days else 30 end;
  t_start timestamptz;
  p_start timestamptz;
  bucket text;
  res jsonb;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then return null; end if;
  t_start := case when d = 1 then date_trunc('day', now()) else now() - make_interval(days => d) end;
  p_start := t_start - (now() - t_start);
  bucket := case when d = 1 then 'hour' when d = 365 then 'month' else 'day' end;

  with items as (
    select oi.*, o.user_id, o.status as order_status, ((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0))) as amount
    from order_items oi join orders o on o.id = oi.order_id
    where oi.seller_id = sid
  ),
  valid as (select * from items where order_status <> 'Annulée' and seller_status <> 'cancelled'),
  ev as (select * from shop_events where seller_id = sid),
  buckets as (
    select generate_series(date_trunc(bucket, t_start), date_trunc(bucket, now()), ('1 ' || bucket)::interval) as b
  )
  select jsonb_build_object(
    'days', d,
    'balance', public.seller_available_balance(sid),
    'withdrawn', (select coalesce(sum(amount), 0) from seller_withdrawals where seller_id = sid and status in ('pending', 'paid')),
    'pending_balance', (select coalesce(sum(amount), 0) from valid where seller_status in ('pending', 'preparing', 'shipped')),
    'revenue', (select coalesce(sum(amount), 0) from valid where created_at >= t_start),
    'revenue_prev', (select coalesce(sum(amount), 0) from valid where created_at >= p_start and created_at < t_start),
    'orders', (select count(distinct order_id) from valid where created_at >= t_start),
    'orders_prev', (select count(distinct order_id) from valid where created_at >= p_start and created_at < t_start),
    'customers', (select count(distinct user_id) from valid where created_at >= t_start),
    'customers_prev', (select count(distinct user_id) from valid where created_at >= p_start and created_at < t_start),
    'products', (select count(*) from seller_products where user_id = auth.uid()),
    'products_online', (select count(*) from products where seller_id = sid and is_published),
    'visits', (select count(*) from ev where kind in ('shop', 'product') and created_at >= t_start),
    'visits_prev', (select count(*) from ev where kind in ('shop', 'product') and created_at >= p_start and created_at < t_start),
    'visitors', (select count(distinct visitor_id) from ev where created_at >= t_start),
    'visits_today', (select count(*) from ev where kind in ('shop', 'product') and created_at >= date_trunc('day', now())),
    'shop_views', (select count(*) from ev where kind = 'shop' and created_at >= t_start),
    'product_views', (select count(*) from ev where kind = 'product' and created_at >= t_start),
    'cart_adds', (select count(*) from ev where kind = 'cart' and created_at >= t_start),
    'funnel', jsonb_build_object(
      'visitors', (select count(distinct visitor_id) from ev where created_at >= t_start),
      'product_viewers', (select count(distinct visitor_id) from ev where kind = 'product' and created_at >= t_start),
      'cart_adders', (select count(distinct visitor_id) from ev where kind = 'cart' and created_at >= t_start),
      'buyers', (select count(distinct user_id) from valid where created_at >= t_start)
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'views', (select count(*) from ev where kind in ('shop', 'product') and date_trunc(bucket, created_at) = b),
        'carts', (select count(*) from ev where kind = 'cart' and date_trunc(bucket, created_at) = b),
        'orders', (select count(distinct order_id) from valid where date_trunc(bucket, created_at) = b),
        'revenue', (select coalesce(sum(amount), 0) from valid where date_trunc(bucket, created_at) = b)
      ) order by b), '[]'::jsonb) from buckets
    ),
    'top_products', (
      select coalesce(jsonb_agg(t order by (t->>'revenue')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('title', min(product_title), 'quantity', sum(quantity), 'revenue', sum(amount)) t
        from valid where created_at >= t_start group by product_id order by sum(amount) desc limit 5
      ) x
    ),
    'followers', (select count(*) from seller_followers where seller_id = sid),
    'rating', (select round(avg(r.rating)::numeric, 1) from reviews r join products p on p.id = r.product_id where p.seller_id = sid),
    'reviews', (select count(*) from reviews r join products p on p.id = r.product_id where p.seller_id = sid),
    'shop', (select jsonb_build_object('id', id, 'slug', slug, 'name', name) from sellers where id = sid)
  ) into res;
  return res;
end $function$;

-- seller_available_balance : montants nets de la réduction (1 endroit(s))
CREATE OR REPLACE FUNCTION public.seller_available_balance(_seller uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce((select sum((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)))
              from order_items oi join orders o on o.id = oi.order_id
              where oi.seller_id = _seller and oi.seller_status = 'delivered' and o.status <> 'Annulée'), 0)
    - coalesce((select sum(amount) from seller_withdrawals where seller_id = _seller and status in ('pending', 'paid')), 0)
  )::int
$function$;

-- seller_customers : montants nets de la réduction (1 endroit(s))
CREATE OR REPLACE FUNCTION public.seller_customers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sid as (select id from sellers where owner_id = auth.uid()),
  lines as (
    select o.user_id, o.full_name, o.city, o.district, o.created_at, o.id as order_id, o.order_number,
           oi.quantity, ((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0))) as amount, oi.product_title,
           case when o.status = 'Annulée' then 'cancelled' else oi.seller_status end as status,
           (o.status <> 'Annulée' and oi.seller_status <> 'cancelled') as valid
    from order_items oi join orders o on o.id = oi.order_id
    where oi.seller_id = (select id from sid)
  ),
  per_order as (
    select user_id, order_id, order_number, min(created_at) created_at,
           sum(amount) filter (where valid) amount, sum(quantity) items,
           (array_agg(status order by status))[1] status,
           array_agg(product_title || case when quantity > 1 then ' ×' || quantity else '' end) products
    from lines group by user_id, order_id, order_number
  )
  select coalesce(jsonb_agg(c order by (c->>'last_order') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', md5(l.user_id::text),
      'code', upper(left(md5(l.user_id::text), 6)),
      'name', (array_agg(coalesce(nullif(trim(l.full_name), ''), 'Client Amachia') order by l.created_at desc))[1],
      'area', (array_agg(concat_ws(', ', nullif(l.district, ''), nullif(l.city, '')) order by l.created_at desc))[1],
      'orders', count(distinct l.order_id) filter (where l.valid),
      'items', coalesce(sum(l.quantity) filter (where l.valid), 0),
      'spent', coalesce(sum(l.amount) filter (where l.valid), 0),
      'first_order', min(l.created_at),
      'last_order', max(l.created_at),
      'products', (array_agg(distinct l.product_title))[1:5],
      'order_list', (select coalesce(jsonb_agg(jsonb_build_object('order_number', po.order_number, 'created_at', po.created_at,
                        'amount', coalesce(po.amount, 0), 'items', po.items, 'status', po.status, 'products', po.products) order by po.created_at desc), '[]'::jsonb)
                     from per_order po where po.user_id = l.user_id)
    ) c
    from lines l group by l.user_id
  ) x
$function$;

-- seller_analytics : montants nets de la réduction (1 endroit(s))
CREATE OR REPLACE FUNCTION public.seller_analytics(_from date, _to date, _grain text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
  g text := case when _grain in ('day', 'week', 'month') then _grain else 'day' end;
  f timestamptz := coalesce(_from, current_date - 29)::timestamptz;
  t timestamptz := (coalesce(_to, current_date) + 1)::timestamptz;
  res jsonb;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then return null; end if;
  if t - f > interval '800 days' then f := t - interval '800 days'; end if;
  with valid as (
    select oi.*, o.user_id, ((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0))) as amount, p.category_slug, p.images->>0 as image
    from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
    where oi.seller_id = sid and o.status <> 'Annulée' and oi.seller_status <> 'cancelled'
      and oi.created_at >= f and oi.created_at < t
  ),
  ev as (select * from shop_events where seller_id = sid and created_at >= f and created_at < t),
  buckets as (select generate_series(date_trunc(g, f), date_trunc(g, t - interval '1 second'), ('1 ' || g)::interval) b)
  select jsonb_build_object(
    'from', f, 'to', t, 'grain', g,
    'revenue', (select coalesce(sum(amount), 0) from valid),
    'orders', (select count(distinct order_id) from valid),
    'items', (select coalesce(sum(quantity), 0) from valid),
    'customers', (select count(distinct user_id) from valid),
    'avg_order', (select coalesce(round(sum(amount)::numeric / nullif(count(distinct order_id), 0)), 0) from valid),
    'visits', (select count(*) from ev where kind in ('shop', 'product')),
    'visitors', (select count(distinct visitor_id) from ev),
    'cart_adds', (select count(*) from ev where kind = 'cart'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', b,
        'revenue', (select coalesce(sum(amount), 0) from valid where date_trunc(g, created_at) = b),
        'orders', (select count(distinct order_id) from valid where date_trunc(g, created_at) = b),
        'visits', (select count(*) from ev where kind in ('shop', 'product') and date_trunc(g, created_at) = b)
      ) order by b), '[]'::jsonb) from buckets),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', s, 'visits', n) order by n desc), '[]'::jsonb)
                from (select coalesce(source, 'other') s, count(*) n from ev where kind in ('shop', 'product') group by 1) x),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', c, 'revenue', r, 'items', q) order by r desc), '[]'::jsonb)
                   from (select coalesce(category_slug, 'autre') c, sum(amount) r, sum(quantity) q from valid group by 1) x),
    'top_products', (select coalesce(jsonb_agg(x order by (x->>'revenue')::numeric desc, (x->>'views')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'title', p.title, 'image', p.images->>0,
          'views', (select count(*) from ev where kind = 'product' and product_id = p.id),
          'carts', (select count(*) from ev where kind = 'cart' and product_id = p.id),
          'items', (select coalesce(sum(quantity), 0) from valid where product_id = p.id),
          'revenue', (select coalesce(sum(amount), 0) from valid where product_id = p.id)
        ) x
        from products p where p.seller_id = sid and p.is_published
      ) y)
  ) into res;
  return res;
end $function$;

-- grant_review_reward : montants nets de la réduction (2 endroit(s))
CREATE OR REPLACE FUNCTION public.grant_review_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into reward_transactions (user_id, points, type, description, order_id, product_id)
  select new.user_id, round((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) * 0.01)::int, 'cashback',
         'Points pour votre avis : ' || left(oi.product_title, 60) || ' (commande ' || o.order_number || ')', o.id, new.product_id
  from order_items oi join orders o on o.id = oi.order_id
  where oi.product_id = new.product_id and o.user_id = new.user_id and o.status <> 'Annulée'
    and round((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) * 0.01) > 0
  on conflict do nothing;
  return null;
end $function$;

-- can_review : montants nets de la réduction (1 endroit(s))
CREATE OR REPLACE FUNCTION public.can_review(_product uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'purchased', exists (select 1 from order_items oi join orders o on o.id = oi.order_id
                         where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'),
    'points', coalesce((select sum(round((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) * 0.01))::int
                        from order_items oi join orders o on o.id = oi.order_id
                        where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'
                          and not exists (select 1 from reward_transactions rt where rt.order_id = o.id and rt.product_id = _product)), 0)
  )
$function$;
