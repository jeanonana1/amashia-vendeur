-- Amachia — Admin, étape 11 :
--   1. Les coupons / ventes flash / campagnes créés depuis l'admin sont acceptés (contrôles vendeur ignorés pour l'équipe admin)
--   2. Coupons « toute la marketplace » : valables sur tous les produits, réduction prise en charge par Amachia
--   3. Ventes flash : plusieurs produits d'un coup + rapport complet des ventes flash
--   4. Verrouillage de la session admin après 1 heure d'inactivité (contrôlé aussi en base)

-- 0. Session admin valide (rôle + double authentification + membre actif) ---------------------------
create or replace function public.is_admin_session() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
    and exists (select 1 from admin_staff where user_id = auth.uid() and status = 'active')
$$;

-- 1. Contrôles vendeur : l'équipe admin crée au nom d'une boutique (ou de toute la marketplace)
do $$ declare f text; def text; begin
  foreach f in array array['seller_coupon_guard', 'seller_flash_guard', 'seller_campaign_guard'] loop
    def := pg_get_functiondef(('public.' || f)::regproc);
    if position('is_admin_session' in def) = 0 then
      def := regexp_replace(def, 'declare sid uuid;\s*begin', E'declare sid uuid;\nbegin\n  if public.is_admin_session() then new.updated_at := now(); return new; end if;');
      if f <> 'seller_coupon_guard' then def := replace(def, 'new.updated_at := now(); return new;', 'return new;'); end if;
      execute def;
    end if;
  end loop;
end $$;

-- 2. Coupons marketplace ----------------------------------------------------------------------------
alter table public.seller_coupons alter column seller_id drop not null;
alter table public.seller_coupons add column if not exists created_by_admin boolean not null default false;
-- Réduction d'un coupon Amachia : à la charge d'Amachia, elle ne réduit pas le montant du vendeur
alter table public.order_items add column if not exists platform_discount_fcfa integer not null default 0;

create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid; sub integer; disc integer;
begin
  oid := coalesce(new.order_id, old.order_id);
  select coalesce(sum(unit_price_fcfa * quantity), 0), coalesce(sum(discount_fcfa + platform_discount_fcfa), 0) into sub, disc
    from public.order_items where order_id = oid;
  update public.orders set subtotal_fcfa = sub, discount_fcfa = disc,
    total_fcfa = greatest(0, sub + shipping_fee_fcfa - disc - coalesce(points_used, 0)) where id = oid;
  return null;
end $$;

create or replace function public.coupon_eval(_code text, _lines jsonb, _uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.seller_coupons%rowtype; shop text; eligible integer := 0; ids uuid[] := '{}'; disc integer; line jsonb; p record; qty integer; mkt boolean;
begin
  select * into c from public.seller_coupons where upper(code) = upper(btrim(coalesce(_code, '')));
  if c.id is null then return jsonb_build_object('ok', false, 'message', 'Ce code promo n''existe pas.'); end if;
  mkt := c.seller_id is null;
  if mkt then shop := 'Amachia'; else select name into shop from public.sellers where id = c.seller_id and is_active; end if;
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
      select pr.id, pr.seller_id into p from public.products pr join public.sellers s on s.id = pr.seller_id and s.is_active
        where pr.is_published and (pr.id::text = line->>'productId' or pr.slug = line->>'productId');
      if p.id is not null and (mkt or p.seller_id = c.seller_id) and (c.product_id is null or c.product_id = p.id) then
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
    return jsonb_build_object('ok', false, 'message', 'Ce coupon demande au moins ' || to_char(c.min_order_fcfa, 'FM999G999G999') || ' FCFA d''achat' || case when mkt then '' else ' chez ' || shop end || '.');
  end if;
  disc := case when c.kind = 'percent' then round(eligible * c.value / 100.0)::int else least(c.value, eligible) end;
  return jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'value', c.value, 'discount', disc,
    'eligible_subtotal', eligible, 'product_ids', to_jsonb(ids), 'seller_name', shop,
    'scope', case when mkt and c.product_id is null then 'marketplace' when c.product_id is null then 'shop' else 'product' end,
    'platform', mkt, 'ends_at', c.ends_at);
end $$;
revoke all on function public.coupon_eval(text, jsonb, uuid) from public, anon, authenticated;

-- Fiche produit : coupons de la boutique + coupons Amachia valables sur toute la marketplace
create or replace function public.product_coupons(_product uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'kind', c.kind, 'value', c.value, 'min_order_fcfa', c.min_order_fcfa, 'ends_at', c.ends_at,
      'scope', case when c.seller_id is null and c.product_id is null then 'marketplace' when c.product_id is null then 'shop' else 'product' end)
      order by (c.seller_id is null), (c.product_id is null), c.value desc), '[]'::jsonb)
  from public.seller_coupons c
  join public.products p on p.id = _product and p.is_published
  join public.sellers s on s.id = p.seller_id and s.is_active
  where (c.seller_id = p.seller_id or c.seller_id is null) and (c.product_id is null or c.product_id = p.id)
    and c.is_active and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
    and (c.max_uses is null or public.coupon_uses(c.code) < c.max_uses);
$$;
grant execute on function public.product_coupons(uuid) to anon, authenticated;

-- Paiement : la réduction d'un coupon Amachia va dans platform_discount_fcfa (le vendeur touche son prix plein)
do $$ declare def text; begin
  def := pg_get_functiondef('public.customer_checkout'::regproc);
  if position('platform_discount_fcfa' in def) = 0 then
    def := replace(def, 'UPDATE public.order_items SET discount_fcfa=part WHERE id=it.id;',
      'IF coalesce((ev->>''platform'')::boolean,false) THEN UPDATE public.order_items SET platform_discount_fcfa=part WHERE id=it.id; ELSE UPDATE public.order_items SET discount_fcfa=part WHERE id=it.id; END IF;');
    if position('platform_discount_fcfa' in def) = 0 then raise exception 'Paiement : emplacement de la réduction introuvable'; end if;
    execute def;
  end if;
end $$;

create or replace function public.admin_save_coupon(_c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s sellers; _code text := upper(regexp_replace(coalesce(_c->>'code', ''), '\s', '', 'g')); mkt boolean := coalesce(_c->>'scope', '') = 'marketplace';
begin
  perform public.admin_guard('admin_save_coupon');
  if nullif(_c->>'id', '') is not null then
    update seller_coupons set is_active = coalesce((_c->>'is_active')::boolean, is_active), updated_at = now() where id = (_c->>'id')::uuid; return;
  end if;
  if not mkt then
    select * into s from sellers where id = nullif(_c->>'seller_id', '')::uuid;
    if s.id is null then raise exception 'Choisissez la boutique concernée, ou « Toute la marketplace ».'; end if;
    if nullif(_c->>'product_id', '') is not null and not exists (select 1 from products where id = (_c->>'product_id')::uuid and seller_id = s.id) then
      raise exception 'Ce produit n''appartient pas à cette boutique.';
    end if;
  end if;
  if _code !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'Code invalide : 3 à 20 lettres ou chiffres.'; end if;
  if exists (select 1 from seller_coupons sc where upper(sc.code) = _code) then raise exception 'Ce code existe déjà.'; end if;
  if coalesce(nullif(_c->>'value', '')::int, 0) <= 0 then raise exception 'Indiquez la valeur de la réduction.'; end if;
  if coalesce(_c->>'kind', 'percent') = 'percent' and (_c->>'value')::int > 90 then raise exception 'La réduction ne peut pas dépasser 90 %%.'; end if;
  insert into seller_coupons (owner_id, seller_id, code, kind, value, product_id, min_order_fcfa, max_uses, starts_at, ends_at, is_active, created_by_admin)
  values (case when mkt then auth.uid() else coalesce(s.owner_id, auth.uid()) end, case when mkt then null else s.id end, _code, coalesce(nullif(_c->>'kind', ''), 'percent'),
    (_c->>'value')::int, case when mkt then null else nullif(_c->>'product_id', '')::uuid end,
    coalesce(nullif(_c->>'min_order', '')::int, 0), nullif(_c->>'max_uses', '')::int,
    coalesce(nullif(_c->>'starts_at', '')::timestamptz, now()), nullif(_c->>'ends_at', '')::timestamptz, true, true);
end $$;

-- Liste admin : les coupons marketplace apparaissent « Toute la marketplace »
do $$ declare def text; begin
  def := pg_get_functiondef('public.admin_marketing'::regproc);
  if position('Toute la marketplace' in def) = 0 then
    def := replace(def, $x$'seller', s.name, 'seller_logo', s.logo_url,$x$,
      $x$'seller', coalesce(s.name, 'Toute la marketplace'), 'seller_logo', s.logo_url, 'marketplace', c.seller_id is null, 'by_admin', c.created_by_admin,$x$);
    execute def;
  end if;
end $$;

-- 3. Ventes flash -----------------------------------------------------------------------------------
-- Plusieurs produits d'un coup (même réduction, mêmes dates)
drop function if exists public.admin_save_flash(jsonb) cascade; -- le type de retour change (nombre de ventes flash créées)
create or replace function public.admin_save_flash(_f jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare p record; ids uuid[]; n int := 0;
begin
  perform public.admin_guard('admin_save_flash');
  if nullif(_f->>'id', '') is not null then
    update seller_flash_sales set is_active = coalesce((_f->>'is_active')::boolean, is_active) where id = (_f->>'id')::uuid; return 1;
  end if;
  ids := coalesce(array(select jsonb_array_elements_text(coalesce(_f->'product_ids', '[]'::jsonb))::uuid), '{}');
  if nullif(_f->>'product_id', '') is not null then ids := ids || (_f->>'product_id')::uuid; end if;
  if cardinality(ids) = 0 then raise exception 'Choisissez au moins un produit.'; end if;
  if coalesce(nullif(_f->>'value', '')::int, 0) <= 0 then raise exception 'Indiquez la réduction.'; end if;
  if nullif(_f->>'ends_at', '') is null then raise exception 'Indiquez la date de fin.'; end if;
  for p in select pr.id, s.id sid, s.owner_id from products pr join sellers s on s.id = pr.seller_id where pr.id = any(ids) loop
    insert into seller_flash_sales (owner_id, seller_id, product_id, kind, value, starts_at, ends_at, is_active)
    values (coalesce(p.owner_id, auth.uid()), p.sid, p.id, coalesce(nullif(_f->>'kind', ''), 'percent'), (_f->>'value')::int,
      coalesce(nullif(_f->>'starts_at', '')::timestamptz, now()), (_f->>'ends_at')::timestamptz, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.admin_save_flash(jsonb) from public, anon;
grant execute on function public.admin_save_flash(jsonb) to authenticated;

-- Rapport des ventes flash : chaque vente flash avec ses ventes réalisées pendant la période de la promotion
create or replace function public.admin_flash_report(_from timestamptz, _to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_flash_report');
  return (with fl as (
      select f.*, p.title, p.images->>0 image, p.price_fcfa, p.category_slug, s.name seller, s.logo_url seller_logo, f.owner_id <> s.owner_id by_admin
      from seller_flash_sales f join products p on p.id = f.product_id join sellers s on s.id = f.seller_id
      where f.starts_at < _to and f.ends_at >= _from),
    st as (
      select fl.id,
        coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
          where oi.product_id = fl.product_id and oi.created_at >= fl.starts_at and oi.created_at < fl.ends_at and o.status <> 'Annulée'), 0) units,
        coalesce((select count(distinct oi.order_id) from order_items oi join orders o on o.id = oi.order_id
          where oi.product_id = fl.product_id and oi.created_at >= fl.starts_at and oi.created_at < fl.ends_at and o.status <> 'Annulée'), 0) orders,
        coalesce((select sum(oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa) from order_items oi join orders o on o.id = oi.order_id
          where oi.product_id = fl.product_id and oi.created_at >= fl.starts_at and oi.created_at < fl.ends_at and o.status <> 'Annulée'), 0) revenue,
        coalesce((select count(distinct e.visitor_id) from shop_events e
          where e.product_id = fl.product_id and e.kind = 'product' and e.created_at >= fl.starts_at and e.created_at < fl.ends_at), 0) visitors,
        coalesce((select count(*) from shop_events e
          where e.product_id = fl.product_id and e.kind = 'cart' and e.created_at >= fl.starts_at and e.created_at < fl.ends_at), 0) carts,
        -- mêmes durées avant la vente flash, pour comparer
        coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
          where oi.product_id = fl.product_id and oi.created_at >= fl.starts_at - (fl.ends_at - fl.starts_at) and oi.created_at < fl.starts_at and o.status <> 'Annulée'), 0) units_before
      from fl),
    rws as (
      select jsonb_build_object('id', fl.id, 'product_id', fl.product_id, 'title', fl.title, 'image', fl.image, 'seller', fl.seller, 'seller_id', fl.seller_id,
        'seller_logo', fl.seller_logo, 'category', fl.category_slug, 'kind', fl.kind, 'value', fl.value, 'price', fl.price_fcfa,
        'flash_price', case when fl.kind = 'percent' then round(fl.price_fcfa * (100 - fl.value) / 100.0)::int else greatest(0, fl.price_fcfa - fl.value) end,
        'starts_at', fl.starts_at, 'ends_at', fl.ends_at, 'is_active', fl.is_active, 'by_admin', fl.by_admin,
        'status', case when not fl.is_active then 'stopped' when fl.starts_at > now() then 'scheduled' when fl.ends_at <= now() then 'ended' else 'live' end,
        'units', st.units, 'orders', st.orders, 'revenue', st.revenue, 'visitors', st.visitors, 'carts', st.carts, 'units_before', st.units_before,
        'conversion', case when st.visitors > 0 then round(st.orders * 100.0 / st.visitors, 1) else null end) r, st.revenue, st.units, fl.seller, fl.seller_id
      from fl join st on st.id = fl.id)
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(r order by (r->>'starts_at') desc)  from rws), '[]'::jsonb),
      'totals', jsonb_build_object('flash', (select count(*)  from rws), 'live', (select count(*)  from rws where r->>'status' = 'live'),
        'units', (select coalesce(sum(units), 0)  from rws), 'revenue', (select coalesce(sum(revenue), 0)  from rws),
        'orders', (select coalesce(sum((r->>'orders')::int), 0)  from rws), 'visitors', (select coalesce(sum((r->>'visitors')::int), 0)  from rws),
        'sellers', (select count(distinct seller_id)  from rws)),
      'by_seller', coalesce((select jsonb_agg(jsonb_build_object('seller', seller, 'flash', n, 'units', u, 'revenue', rv) order by rv desc) from (
          select seller, count(*) n, sum(units) u, sum(revenue) rv  from rws group by seller) t), '[]'::jsonb),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'units', u, 'revenue', rv) order by d) from (
          select (oi.created_at at time zone 'Africa/Douala')::date d, sum(oi.quantity) u, sum(oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa) rv
          from order_items oi join orders o on o.id = oi.order_id join fl on fl.product_id = oi.product_id and oi.created_at >= fl.starts_at and oi.created_at < fl.ends_at
          where o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to group by 1) t), '[]'::jsonb)));
end $$;
insert into public.admin_fn_sections (fn, sections) values ('admin_flash_report', '{marketing}'), ('admin_touch', '{*}')
on conflict (fn) do update set sections = excluded.sections;

-- 4. Verrouillage après 1 heure d'inactivité -------------------------------------------------------
alter table public.admin_staff add column if not exists last_seen_at timestamptz;

-- Signal d'activité envoyé par l'admin (souris, clavier, changement de page)
create or replace function public.admin_touch() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_session() then return; end if;
  update admin_staff set last_seen_at = now() where user_id = auth.uid();
end $$;
revoke execute on function public.admin_touch() from public, anon;
grant execute on function public.admin_touch() to authenticated;

-- La garde refuse toute session restée inactive plus d'une heure (une nouvelle connexion repart à zéro)
do $$ declare def text; begin
  def := pg_get_functiondef('public.admin_guard'::regproc);
  if position('inactivité' in def) = 0 then
    def := replace(def, $x$  if s.user_id is null or s.status <> 'active' then raise exception 'Compte administrateur désactivé.' using errcode = '42501'; end if;$x$,
      $x$  if s.user_id is null or s.status <> 'active' then raise exception 'Compte administrateur désactivé.' using errcode = '42501'; end if;
  if greatest(coalesce(s.last_seen_at, '-infinity'),
       coalesce((select se.created_at from auth.sessions se where se.id = nullif(auth.jwt() ->> 'session_id', '')::uuid), '-infinity')) < now() - interval '1 hour' then
    raise exception 'Session verrouillée après 1 heure d''inactivité : reconnectez-vous.' using errcode = '42501';
  end if;$x$);
    if position('inactivité' in def) = 0 then raise exception 'admin_guard : emplacement introuvable'; end if;
    execute def;
  end if;
end $$;

-- Une page ouverte compte comme une activité
do $$ declare def text; begin
  def := pg_get_functiondef('public.admin_log_page'::regproc);
  if position('last_seen_at' in def) = 0 then
    def := replace(def, $x$  if exists (select 1 from admin_activity where user_id = uid and kind = 'page'$x$,
      $x$  update admin_staff set last_seen_at = now() where user_id = uid;
  if exists (select 1 from admin_activity where user_id = uid and kind = 'page'$x$);
    execute def;
  end if;
end $$;
