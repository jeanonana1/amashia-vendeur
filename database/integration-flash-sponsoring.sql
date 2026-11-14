-- =====================================================================
-- Ventes flash (prix réduit sur une période, appliqué à la commande)
-- et campagnes sponsorisées (mise en avant + statistiques réelles).
-- =====================================================================
create table if not exists public.seller_flash_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'percent' or value <= 90)
);
create index if not exists flash_product_idx on public.seller_flash_sales (product_id, ends_at);
alter table public.seller_flash_sales enable row level security;
drop policy if exists "flash : le vendeur gère les siennes" on public.seller_flash_sales;
create policy "flash : le vendeur gère les siennes" on public.seller_flash_sales for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "flash : visibles par tous si actives" on public.seller_flash_sales;
create policy "flash : visibles par tous si actives" on public.seller_flash_sales for select to anon, authenticated using (is_active and ends_at > now());
grant select on public.seller_flash_sales to anon;
grant select, insert, update, delete on public.seller_flash_sales to authenticated;

create or replace function public.seller_flash_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from public.sellers where owner_id = auth.uid() limit 1;
  if sid is null then raise exception 'Boutique introuvable.'; end if;
  new.owner_id := auth.uid();
  new.seller_id := sid;
  if not exists (select 1 from public.products where id = new.product_id and seller_id = sid) then raise exception 'Ce produit n''appartient pas à votre boutique.'; end if;
  if new.ends_at > new.starts_at + interval '31 days' then raise exception 'Une vente flash dure 31 jours au maximum.'; end if;
  if new.is_active and exists (select 1 from public.seller_flash_sales f where f.product_id = new.product_id and f.id <> new.id and f.is_active
                               and tstzrange(f.starts_at, f.ends_at) && tstzrange(new.starts_at, new.ends_at)) then
    raise exception 'Ce produit a déjà une vente flash sur cette période.';
  end if;
  if new.kind = 'fixed' and new.value >= (select price_fcfa from public.products where id = new.product_id) then
    raise exception 'La réduction doit être inférieure au prix du produit.';
  end if;
  return new;
end $$;
drop trigger if exists seller_flash_guard on public.seller_flash_sales;
create trigger seller_flash_guard before insert or update on public.seller_flash_sales for each row execute function public.seller_flash_guard();

-- prix après vente flash (en cours à l'instant présent)
create or replace function public.apply_flash(_product uuid, _price integer)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((
    select greatest(1, case when f.kind = 'percent' then round(_price * (100 - f.value) / 100.0)::int else _price - f.value end)
    from public.seller_flash_sales f
    where f.product_id = _product and f.is_active and f.starts_at <= now() and f.ends_at > now()
    order by f.created_at desc limit 1), _price);
$$;

-- le prix réel d'un article tient compte de la vente flash en cours
create or replace function public.product_variant_price(_product uuid, _color text, _options text)
returns integer language sql stable security definer set search_path = public as $fn$
  select public.apply_flash(_product, (with p as (select price_fcfa, variant_prices from public.products where id = _product),
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
  ), (select price_fcfa from p))));
$fn$;

-- ------------------------------------------------------------- Sponsoring
create table if not exists public.seller_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  placement text not null default 'all' check (placement in ('all', 'home', 'search')),
  daily_budget integer check (daily_budget is null or daily_budget >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);
alter table public.seller_campaigns enable row level security;
drop policy if exists "campagnes : le vendeur gère les siennes" on public.seller_campaigns;
create policy "campagnes : le vendeur gère les siennes" on public.seller_campaigns for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.seller_campaigns to authenticated;

create or replace function public.seller_campaign_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from public.sellers where owner_id = auth.uid() limit 1;
  if sid is null then raise exception 'Boutique introuvable.'; end if;
  new.owner_id := auth.uid(); new.seller_id := sid;
  new.name := btrim(new.name);
  if length(new.name) < 2 then raise exception 'Donnez un nom à la campagne.'; end if;
  if not exists (select 1 from public.products where id = new.product_id and seller_id = sid and is_published) then raise exception 'Choisissez un de vos produits en ligne.'; end if;
  if new.ends_at is not null and new.ends_at <= new.starts_at then raise exception 'La date de fin doit être après la date de début.'; end if;
  return new;
end $$;
drop trigger if exists seller_campaign_guard on public.seller_campaigns;
create trigger seller_campaign_guard before insert or update on public.seller_campaigns for each row execute function public.seller_campaign_guard();

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.seller_campaigns(id) on delete cascade,
  kind text not null check (kind in ('impression', 'click', 'cart', 'purchase')),
  visitor_id text not null,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists campaign_events_idx on public.campaign_events (campaign_id, kind, created_at);
alter table public.campaign_events enable row level security;
revoke all on public.campaign_events from anon, authenticated;

-- produits sponsorisés à afficher (campagnes actives)
create or replace function public.sponsored_products(_placement text default 'all')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('campaign_id', c.id, 'product_id', c.product_id) order by random()), '[]'::jsonb)
  from public.seller_campaigns c join public.products p on p.id = c.product_id and p.is_published and p.stock > 0
  join public.sellers s on s.id = c.seller_id and s.is_active
  where c.status = 'active' and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
    and (c.placement = 'all' or c.placement = _placement or _placement = 'all');
$$;
grant execute on function public.sponsored_products(text) to anon, authenticated;

-- statistiques : affichage, clic, ajout au panier (dédoublonnés 30 min par visiteur), achat (vérifié)
create or replace function public.track_campaign_event(_campaign uuid, _kind text, _visitor text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.seller_campaigns%rowtype; amt integer := 0;
begin
  if _kind not in ('impression', 'click', 'cart', 'purchase') or coalesce(length(_visitor), 0) not between 8 and 64 then return; end if;
  select * into c from public.seller_campaigns where id = _campaign;
  if c.id is null then return; end if;
  if _kind = 'purchase' then
    -- un achat ne compte que si le client connecté a vraiment commandé ce produit il y a moins de 15 minutes
    if auth.uid() is null then return; end if;
    select coalesce(sum(oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa), 0)::int into amt
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where o.user_id = auth.uid() and oi.product_id = c.product_id and o.created_at > now() - interval '15 minutes';
    if amt = 0 then return; end if;
    if exists (select 1 from public.campaign_events e where e.campaign_id = c.id and e.kind = 'purchase' and e.visitor_id = _visitor and e.created_at > now() - interval '15 minutes') then return; end if;
  elsif exists (select 1 from public.campaign_events e where e.campaign_id = c.id and e.kind = _kind and e.visitor_id = _visitor and e.created_at > now() - interval '30 minutes') then
    return;
  end if;
  insert into public.campaign_events(campaign_id, kind, visitor_id, amount) values (c.id, _kind, _visitor, amt);
end $$;
grant execute on function public.track_campaign_event(uuid, text, text) to anon, authenticated;

-- campagnes du vendeur avec leurs résultats
create or replace function public.seller_campaigns_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'product_id', c.product_id, 'product_title', p.title, 'product_image', p.images->>0,
    'placement', c.placement, 'daily_budget', c.daily_budget, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'status', c.status, 'created_at', c.created_at,
    'impressions', (select count(*) from public.campaign_events e where e.campaign_id = c.id and e.kind = 'impression'),
    'clicks', (select count(*) from public.campaign_events e where e.campaign_id = c.id and e.kind = 'click'),
    'carts', (select count(*) from public.campaign_events e where e.campaign_id = c.id and e.kind = 'cart'),
    'purchases', (select count(*) from public.campaign_events e where e.campaign_id = c.id and e.kind = 'purchase'),
    'revenue', (select coalesce(sum(amount), 0) from public.campaign_events e where e.campaign_id = c.id and e.kind = 'purchase'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'clicks', d.clicks, 'carts', d.carts, 'purchases', d.purchases) order by d.day), '[]'::jsonb)
              from (select date_trunc('day', e.created_at at time zone 'Africa/Douala')::date as day,
                           count(*) filter (where kind = 'click') clicks, count(*) filter (where kind = 'cart') carts, count(*) filter (where kind = 'purchase') purchases
                    from public.campaign_events e where e.campaign_id = c.id and e.created_at > now() - interval '30 days' group by 1) d)
  ) order by c.created_at desc), '[]'::jsonb)
  from public.seller_campaigns c left join public.products p on p.id = c.product_id
  where c.owner_id = auth.uid();
$$;
grant execute on function public.seller_campaigns_list() to authenticated;

-- ventes flash du vendeur
create or replace function public.seller_flash_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'product_id', f.product_id, 'product_title', p.title, 'product_image', p.images->>0, 'price', p.price_fcfa,
    'kind', f.kind, 'value', f.value, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'is_active', f.is_active,
    'flash_price', greatest(1, case when f.kind = 'percent' then round(p.price_fcfa * (100 - f.value) / 100.0)::int else p.price_fcfa - f.value end),
    'sold', (select coalesce(sum(oi.quantity), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
             where oi.product_id = f.product_id and o.status <> 'Annulée' and o.created_at between f.starts_at and f.ends_at)
  ) order by f.ends_at desc), '[]'::jsonb)
  from public.seller_flash_sales f join public.products p on p.id = f.product_id
  where f.owner_id = auth.uid();
$$;
grant execute on function public.seller_flash_list() to authenticated;
