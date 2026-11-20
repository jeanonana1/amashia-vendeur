-- Amachia — Admin, étape 6 : commissions, solde vendeur net, finances (transactions), retraits, Prime (plans).
-- La commission ne s'applique qu'aux commandes passées à partir de cette mise à jour (taux figé sur chaque article).

-- 1. Commission figée sur chaque article commandé ---------------------------------------------------
alter table public.order_items add column if not exists commission_pct numeric(5,2) not null default 0;

create or replace function public.item_commission(_price integer, _qty integer, _disc integer, _pct numeric)
returns integer language sql immutable as $$
  select round((_price * coalesce(_qty, 1) - coalesce(_disc, 0)) * coalesce(_pct, 0) / 100.0)::int
$$;

create or replace function public.trg_item_commission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(c.commission_pct, 0) into new.commission_pct
  from public.products p join public.categories c on c.slug = p.category_slug where p.id = new.product_id;
  new.commission_pct := coalesce(new.commission_pct, 0);
  return new;
end $$;
drop trigger if exists order_item_commission on public.order_items;
create trigger order_item_commission before insert on public.order_items for each row execute function public.trg_item_commission();

-- Remboursement réglé (argent ou avoir) : retiré du solde du vendeur (part nette, hors commission)
create or replace function public.return_seller_cost(_r public.return_requests) returns integer
language sql stable set search_path = public as $$
  select case when _r.status = 'refunded' and _r.solution in ('refund', 'credit')
    then _r.amount - coalesce((select public.item_commission(_r.amount, 1, 0, oi.commission_pct) from public.order_items oi where oi.id = _r.order_item_id), 0)
    else 0 end
$$;

-- Solde disponible du vendeur = ventes livrées après commission − retraits − remboursements
create or replace function public.seller_available_balance(_seller uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)
                         - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct))
              from order_items oi join orders o on o.id = oi.order_id
              where oi.seller_id = _seller and oi.seller_status = 'delivered' and o.status <> 'Annulée'), 0)
    - coalesce((select sum(amount) from seller_withdrawals where seller_id = _seller and status in ('pending', 'paid')), 0)
    - coalesce((select sum(public.return_seller_cost(r)) from return_requests r where r.seller_id = _seller), 0)
  )::int
$$;

-- Espace vendeur : « en attente de livraison » aussi après commission
do $$ declare def text; begin
  def := pg_get_functiondef('public.seller_dashboard_stats'::regproc);
  if position('net_pending' in def) = 0 then
    def := replace(def, $x$'pending_balance', (select coalesce(sum(amount), 0) from valid where seller_status in ('pending', 'preparing', 'shipped')),$x$,
      $x$'pending_balance', (select coalesce(sum(amount - public.item_commission(unit_price_fcfa, quantity, discount_fcfa, commission_pct)), 0) from valid where seller_status in ('pending', 'preparing', 'shipped')), -- net_pending
    'commission_total', (select coalesce(sum(public.item_commission(unit_price_fcfa, quantity, discount_fcfa, commission_pct)), 0) from valid),$x$);
    execute def;
  end if;
end $$;

-- Ventes du vendeur : commission et montant net (ajoutés en fin de vue)
create or replace view public.seller_orders as
 SELECT oi.id, o.order_number, oi.product_id AS listing_id, sp.id AS product_id, s.owner_id AS seller_id,
    COALESCE(NULLIF(TRIM(BOTH FROM o.full_name), ''::text), 'Client Amachia'::text) AS customer_name,
    concat_ws(', '::text, NULLIF(o.district, ''::text), NULLIF(o.city, ''::text)) AS delivery_area,
    oi.product_title, oi.quantity, oi.unit_price_fcfa AS unit_price,
    oi.unit_price_fcfa * COALESCE(oi.quantity, 1) - oi.discount_fcfa AS amount,
    COALESCE(o.payment_method, 'À la livraison'::text) AS payment_method, false AS paid,
    CASE WHEN o.status = 'Annulée'::text THEN 'cancelled'::text ELSE oi.seller_status END AS status,
    oi.created_at, oi.color, oi.size AS options,
    (SELECT p.images ->> 0 FROM products p WHERE p.id = oi.product_id) AS product_image,
    o.id AS order_id, oi.discount_fcfa AS discount, o.coupon_code,
    oi.commission_pct,
    public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct) AS commission,
    oi.unit_price_fcfa * COALESCE(oi.quantity, 1) - oi.discount_fcfa - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct) AS net_amount
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN sellers s ON s.id = oi.seller_id
     LEFT JOIN seller_products sp ON sp.marketplace_product_id = oi.product_id
  WHERE s.owner_id = auth.uid();

-- Page « Commissions » du vendeur
create or replace function public.seller_commissions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then raise exception 'Boutique introuvable'; end if;
  return jsonb_build_object(
    'balance', public.seller_available_balance(sid),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'pct', c.commission_pct) order by c.sort_order) from categories c where c.parent_id is null), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'gross', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0),
        'commission', coalesce(sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)), 0),
        'delivered_net', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status = 'delivered'), 0),
        'pending_net', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status in ('pending','preparing','shipped')), 0))
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_id = sid and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'),
    'withdrawn', (select coalesce(sum(amount), 0) from seller_withdrawals where seller_id = sid and status in ('pending', 'paid')),
    'refunds', (select coalesce(sum(public.return_seller_cost(r)), 0) from return_requests r where r.seller_id = sid),
    'items', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('order_number', o.order_number, 'title', oi.product_title, 'qty', oi.quantity, 'status', oi.seller_status,
        'category', coalesce(c.name, p.category_slug), 'image', p.images->>0, 'created_at', oi.created_at,
        'gross', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa), 'pct', oi.commission_pct,
        'commission', public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct),
        'net', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) x
      from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id left join categories c on c.slug = p.category_slug
      where oi.seller_id = sid and oi.seller_status <> 'cancelled' and o.status <> 'Annulée'
      order by oi.created_at desc limit 200) t), '[]'::jsonb));
end $$;
revoke execute on function public.seller_commissions() from public, anon;
grant execute on function public.seller_commissions() to authenticated;

-- 2. Admin : commissions ------------------------------------------------------------------------------
create or replace function public.admin_commissions(_from timestamptz, _to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'pct', c.commission_pct,
        'sales', coalesce(x.sales, 0), 'commission', coalesce(x.com, 0), 'items', coalesce(x.n, 0)) order by c.sort_order)
      from categories c left join lateral (
        select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) sales,
               sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) com, count(*) n
        from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
        where p.category_slug = c.slug and oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to) x on true
      where c.parent_id is null), '[]'::jsonb),
    'sellers', coalesce((select jsonb_agg(t order by (t->>'commission')::numeric desc) from (
        select jsonb_build_object('id', s.id, 'name', s.name, 'logo', s.logo_url,
          'sales', sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)),
          'commission', sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)),
          'collected', coalesce(sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status = 'delivered'), 0)) t
        from order_items oi join orders o on o.id = oi.order_id join sellers s on s.id = oi.seller_id
        where oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to
        group by s.id) z), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'sales', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0),
        'commission', coalesce(sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)), 0),
        'collected', coalesce(sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status = 'delivered'), 0),
        'items_without', count(*) filter (where oi.commission_pct = 0))
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to),
    'recent', coalesce((select jsonb_agg(t) from (
        select jsonb_build_object('order_number', o.order_number, 'title', oi.product_title, 'seller', s.name, 'pct', oi.commission_pct, 'status', oi.seller_status,
          'gross', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa),
          'commission', public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct), 'created_at', oi.created_at) t
        from order_items oi join orders o on o.id = oi.order_id left join sellers s on s.id = oi.seller_id
        where oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to
        order by oi.created_at desc limit 50) z), '[]'::jsonb));
end $$;

create or replace function public.admin_set_commission(_category uuid, _pct numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if _pct is null or _pct < 0 or _pct > 60 then raise exception 'Taux invalide (0 à 60 %%).'; end if;
  update categories set commission_pct = round(_pct, 2) where id = _category;
end $$;

-- La création / modification d'une catégorie fixe aussi son taux de commission
create or replace function public.admin_save_category(_id uuid, _name text, _description text, _image text, _sort int, _pct numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  rid := public.admin_save_category(_id, _name, _description, _image, _sort);
  if _pct is not null then perform public.admin_set_commission(rid, _pct); end if;
  return rid;
end $$;
do $$ begin
  -- admin_taxonomy : renvoie déjà commission_pct
  null;
end $$;

-- 3. Admin : finances (transactions) ---------------------------------------------------------------
create or replace function public.admin_finance(_from timestamptz, _to timestamptz, _seller uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
        'client_paid', coalesce((select sum(total_fcfa) from orders o where o.status <> 'Annulée' and o.created_at >= _from and o.created_at < _to
                                  and (_seller is null or exists (select 1 from order_items oi where oi.order_id = o.id and oi.seller_id = _seller))), 0),
        'shipping', coalesce((select sum(shipping_fee_fcfa) from orders o where o.status <> 'Annulée' and o.created_at >= _from and o.created_at < _to and _seller is null), 0),
        'points', coalesce((select sum(points_used) from orders o where o.status <> 'Annulée' and o.created_at >= _from and o.created_at < _to and _seller is null), 0),
        'coupons', coalesce((select sum(oi.discount_fcfa) from order_items oi join orders o on o.id = oi.order_id where o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to and (_seller is null or oi.seller_id = _seller)), 0),
        'sales', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)), 0),
        'commission', coalesce(sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)), 0),
        'seller_net', coalesce(sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)), 0),
        'refunds', coalesce((select sum(r.amount) from return_requests r where r.status = 'refunded' and r.solution in ('refund','credit') and r.updated_at >= _from and r.updated_at < _to and (_seller is null or r.seller_id = _seller)), 0),
        'paid_out', coalesce((select sum(amount) from seller_withdrawals w where w.status = 'paid' and w.processed_at >= _from and w.processed_at < _to and (_seller is null or w.seller_id = _seller)), 0))
      from order_items oi join orders o on o.id = oi.order_id
      where oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to and (_seller is null or oi.seller_id = _seller)),
    -- Ce que la plateforme doit aux vendeurs, à date (toutes périodes confondues)
    'owed', (select jsonb_build_object(
        'available', coalesce(sum(greatest(0, public.seller_available_balance(s.id))), 0),
        'withdrawals_pending', coalesce((select sum(amount) from seller_withdrawals w where w.status = 'pending' and (_seller is null or w.seller_id = _seller)), 0),
        'in_transit', coalesce((select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct))
                                from order_items oi join orders o on o.id = oi.order_id
                                where oi.seller_status in ('pending','preparing','shipped') and o.status <> 'Annulée' and (_seller is null or oi.seller_id = _seller)), 0))
      from sellers s where _seller is null or s.id = _seller),
    'sellers', coalesce((select jsonb_agg(t order by (t->>'available')::int + (t->>'withdrawals_pending')::int + (t->>'in_transit')::int desc) from (
        select jsonb_build_object('id', s.id, 'name', s.name, 'logo', s.logo_url, 'avatar', sp.avatar_url, 'owner', trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')),
          'payout_method', sp.payment_method, 'phone', sp.phone,
          'delivered_net', coalesce(x.delivered_net, 0), 'in_transit', coalesce(x.in_transit, 0), 'commission', coalesce(x.commission, 0), 'sales', coalesce(x.sales, 0),
          'paid_out', coalesce((select sum(amount) from seller_withdrawals w where w.seller_id = s.id and w.status = 'paid'), 0),
          'withdrawals_pending', coalesce((select sum(amount) from seller_withdrawals w where w.seller_id = s.id and w.status = 'pending'), 0),
          'refunds', coalesce((select sum(public.return_seller_cost(r)) from return_requests r where r.seller_id = s.id), 0),
          'available', greatest(0, public.seller_available_balance(s.id))) t
        from sellers s left join seller_profiles sp on sp.id = s.owner_id
        left join lateral (
          select sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa)) sales,
                 sum(public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) commission,
                 sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status = 'delivered') delivered_net,
                 sum(public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct)) filter (where oi.seller_status in ('pending','preparing','shipped')) in_transit
          from order_items oi join orders o on o.id = oi.order_id where oi.seller_id = s.id and oi.seller_status <> 'cancelled' and o.status <> 'Annulée') x on true
        where _seller is null or s.id = _seller) z), '[]'::jsonb),
    -- Journal de tous les mouvements d'argent sur la période
    'ledger', coalesce((select jsonb_agg(e order by e->>'at' desc) from (
        select jsonb_build_object('at', oi.created_at, 'kind', 'sale', 'label', 'Vente ' || o.order_number || ' · ' || oi.product_title, 'seller', s.name,
          'gross', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa),
          'commission', public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct),
          'seller_amount', public.item_net(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa) - public.item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct),
          'status', oi.seller_status) e
        from order_items oi join orders o on o.id = oi.order_id left join sellers s on s.id = oi.seller_id
        where oi.seller_status <> 'cancelled' and o.status <> 'Annulée' and oi.created_at >= _from and oi.created_at < _to and (_seller is null or oi.seller_id = _seller)
        union all
        select jsonb_build_object('at', coalesce(w.processed_at, w.created_at), 'kind', 'withdrawal', 'label', 'Retrait vendeur' || coalesce(' · ' || (w.method->>'label'), ''), 'seller', s.name,
          'gross', 0, 'commission', 0, 'seller_amount', -w.amount, 'status', w.status)
        from seller_withdrawals w left join sellers s on s.id = w.seller_id
        where w.status <> 'rejected' and coalesce(w.processed_at, w.created_at) >= _from and coalesce(w.processed_at, w.created_at) < _to and (_seller is null or w.seller_id = _seller)
        union all
        select jsonb_build_object('at', r.updated_at, 'kind', 'refund', 'label', 'Remboursement ' || r.ref || ' · ' || r.product_title, 'seller', s.name,
          'gross', -r.amount, 'commission', -(r.amount - public.return_seller_cost(r)), 'seller_amount', -public.return_seller_cost(r), 'status', r.status)
        from return_requests r left join sellers s on s.id = r.seller_id
        where r.status = 'refunded' and r.solution in ('refund','credit') and r.updated_at >= _from and r.updated_at < _to and (_seller is null or r.seller_id = _seller)
        union all
        select jsonb_build_object('at', o.created_at, 'kind', 'points', 'label', 'Points récompense utilisés · ' || o.order_number, 'seller', null,
          'gross', -o.points_used, 'commission', -o.points_used, 'seller_amount', 0, 'status', o.status)
        from orders o where o.points_used > 0 and o.status <> 'Annulée' and o.created_at >= _from and o.created_at < _to and _seller is null
        limit 400) z), '[]'::jsonb));
end $$;

-- 4. Admin : demandes de retrait (photo, titulaire, historique) -------------------------------------
create or replace function public.admin_withdrawals(_status text default 'all') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', w.id, 'amount', w.amount, 'method', w.method, 'status', w.status, 'note', w.note,
        'created_at', w.created_at, 'processed_at', w.processed_at, 'seller', s.name, 'seller_id', s.id, 'slug', s.slug,
        'logo', s.logo_url, 'avatar', sp.avatar_url, 'owner', trim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')),
        'city', s.city, 'kyc', s.kyc_status, 'email', u.email,
        'phone', sp.phone, 'payment_method', sp.payment_method,
        'balance', public.seller_available_balance(s.id),
        'paid_total', (select coalesce(sum(amount), 0) from seller_withdrawals w2 where w2.seller_id = s.id and w2.status = 'paid'),
        'requests', (select count(*) from seller_withdrawals w2 where w2.seller_id = s.id)) x
      from seller_withdrawals w left join sellers s on s.id = w.seller_id
      left join seller_profiles sp on sp.id = w.user_id left join auth.users u on u.id = w.user_id
      where _status = 'all' or w.status = _status
    ) t
  ), '[]'::jsonb);
end $$;

-- 5. Prime : plans ------------------------------------------------------------------------------------
create table if not exists public.prime_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  months int not null check (months between 1 and 24),
  price int not null check (price >= 0),
  description text,
  benefits text[] not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.prime_plans enable row level security;
drop policy if exists "Lecture publique des plans Prime" on public.prime_plans;
create policy "Lecture publique des plans Prime" on public.prime_plans for select using (true);
insert into public.prime_plans (name, months, price, description, benefits, sort_order)
select 'Prime Mensuel', 1, (select prime_price from platform_settings where id = 1), 'Abonnement d''un mois, renouvelable.', array['Livraison gratuite sur toutes les commandes'], 1
where not exists (select 1 from public.prime_plans);

alter table public.prime_subscriptions add column if not exists plan_id uuid references public.prime_plans(id) on delete set null;
alter table public.prime_subscriptions add column if not exists amount_paid integer not null default 0;
alter table public.prime_subscriptions add column if not exists payment_ref text;

create or replace function public.admin_save_prime_plan(_id uuid, _name text, _months int, _price int, _description text, _benefits text[], _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom du plan.'; end if;
  if _months is null or _months < 1 or _months > 24 then raise exception 'Durée invalide (1 à 24 mois).'; end if;
  if _price is null or _price < 0 then raise exception 'Prix invalide.'; end if;
  if _id is null then
    insert into prime_plans (name, months, price, description, benefits, is_active, sort_order)
    values (btrim(_name), _months, _price, nullif(btrim(_description), ''), coalesce(_benefits, '{}'), coalesce(_active, true), (select coalesce(max(sort_order), 0) + 1 from prime_plans));
  else
    update prime_plans set name = btrim(_name), months = _months, price = _price, description = nullif(btrim(_description), ''),
      benefits = coalesce(_benefits, '{}'), is_active = coalesce(_active, is_active) where id = _id;
  end if;
end $$;

create or replace function public.admin_delete_prime_plan(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if exists (select 1 from prime_subscriptions where plan_id = _id) then raise exception 'Des abonnements utilisent ce plan : désactivez-le plutôt.'; end if;
  delete from prime_plans where id = _id;
end $$;

-- Attribuer un plan à un client (après paiement reçu)
create or replace function public.admin_grant_prime_plan(_email text, _plan uuid, _ref text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; cur timestamptz; pl prime_plans;
begin
  perform public.admin_guard();
  select * into pl from prime_plans where id = _plan;
  if pl.id is null then raise exception 'Choisissez un plan.'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(_email));
  if uid is null then raise exception 'Aucun compte client avec cet e-mail.'; end if;
  select max(expires_at) into cur from prime_subscriptions where user_id = uid and is_active and expires_at > now();
  insert into prime_subscriptions (user_id, starts_at, expires_at, is_active, plan_id, amount_paid, payment_ref)
  values (uid, coalesce(cur, now()), coalesce(cur, now()) + make_interval(months => pl.months), true, pl.id, pl.price, nullif(btrim(_ref), ''));
end $$;

create or replace function public.admin_prime() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'price', (select prime_price from platform_settings where id = 1),
    'free_shipping', (select prime_free_shipping from platform_settings where id = 1),
    'active', (select count(distinct user_id) from prime_subscriptions where is_active and starts_at <= now() and expires_at > now()),
    'expiring', (select count(distinct user_id) from prime_subscriptions where is_active and expires_at > now() and expires_at < now() + interval '7 days'),
    'new_30d', (select count(*) from prime_subscriptions where created_at > now() - interval '30 days'),
    'revenue_total', (select coalesce(sum(amount_paid), 0) from prime_subscriptions),
    'revenue_30d', (select coalesce(sum(amount_paid), 0) from prime_subscriptions where created_at > now() - interval '30 days'),
    'shipping_saved', (select coalesce(sum(d.base_fee), 0) from (
        select (public.delivery_quote(o.city, 0)->>'base_fee')::int base_fee from orders o
        where o.status <> 'Annulée' and o.shipping_fee_fcfa = 0 and exists (
          select 1 from prime_subscriptions ps where ps.user_id = o.user_id and ps.is_active and o.created_at between ps.starts_at and ps.expires_at)) d),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'months', p.months, 'price', p.price, 'description', p.description,
        'benefits', to_jsonb(p.benefits), 'is_active', p.is_active,
        'subscribers', (select count(distinct user_id) from prime_subscriptions s where s.plan_id = p.id and s.is_active and s.expires_at > now()),
        'revenue', (select coalesce(sum(amount_paid), 0) from prime_subscriptions s where s.plan_id = p.id)) order by p.sort_order, p.price) from prime_plans p), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'revenue', coalesce(r.rev, 0), 'subs', coalesce(r.n, 0)) order by m)
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
        left join (select date_trunc('month', created_at) mo, sum(amount_paid) rev, count(*) n from prime_subscriptions group by 1) r on r.mo = m), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', p.id, 'user_id', p.user_id, 'name', coalesce(pr.full_name, ''), 'email', u.email, 'phone', pr.phone,
        'starts_at', p.starts_at, 'expires_at', p.expires_at, 'created_at', p.created_at, 'plan', pl.name, 'amount_paid', p.amount_paid, 'payment_ref', p.payment_ref,
        'orders', (select count(*) from orders o where o.user_id = p.user_id and o.status <> 'Annulée' and o.created_at between p.starts_at and p.expires_at),
        'active', p.is_active and p.starts_at <= now() and p.expires_at > now(), 'cancelled', not p.is_active) x
      from prime_subscriptions p left join profiles pr on pr.id = p.user_id left join auth.users u on u.id = p.user_id
      left join prime_plans pl on pl.id = p.plan_id) t), '[]'::jsonb));
end $$;

-- Page Prime du client : plans proposés
create or replace function public.customer_prime() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active', public.prime_active(auth.uid()),
    'expires_at', (select max(expires_at) from public.prime_subscriptions where user_id = auth.uid() and is_active and expires_at > now()),
    'plan', (select pl.name from public.prime_subscriptions p join public.prime_plans pl on pl.id = p.plan_id where p.user_id = auth.uid() and p.is_active and p.expires_at > now() order by p.expires_at desc limit 1),
    'price', s.prime_price, 'free_shipping', s.prime_free_shipping,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'months', p.months, 'price', p.price, 'description', p.description, 'benefits', to_jsonb(p.benefits)) order by p.sort_order, p.price)
                       from public.prime_plans p where p.is_active), '[]'::jsonb))
  from public.platform_settings s where s.id = 1
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_commissions(timestamptz,timestamptz)', 'admin_set_commission(uuid,numeric)', 'admin_save_category(uuid,text,text,text,int,numeric)',
    'admin_finance(timestamptz,timestamptz,uuid)', 'admin_save_prime_plan(uuid,text,int,int,text,text[],boolean)', 'admin_delete_prime_plan(uuid)',
    'admin_grant_prime_plan(text,uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 6. Remboursements : image du produit, libellé du motif, impact sur le solde du vendeur
do $$ declare def text; begin
  def := pg_get_functiondef('public.admin_returns(text)'::regprocedure);
  if position('reason_label' in def) = 0 then
    def := replace(def, $x$'seller_note', r.seller_note,$x$, $x$'seller_note', r.seller_note, 'reason_label', (select x->>'label' from jsonb_array_elements(public.return_reasons()) x where x->>'key' = r.reason),
        'image', (select p.images->>0 from order_items oi join products p on p.id = oi.product_id where oi.id = r.order_item_id),
        'seller_logo', s.logo_url, 'city', o.city, 'seller_cost', public.return_seller_cost(r),
        'commission_pct', (select oi.commission_pct from order_items oi where oi.id = r.order_item_id),$x$);
    execute def;
  end if;
end $$;
