-- Sources de trafic et campagnes (Facebook / Instagram / TikTok Ads, Google, WhatsApp…)
-- Le site client repère la provenance d'une visite (paramètres utm_*, fbclid, ttclid, site d'origine)
-- et la garde 7 jours sur l'appareil (dernier clic non direct). Chaque visite, ajout au panier
-- et commande est rattaché à cette provenance.

alter table shop_events add column if not exists channel text;
alter table shop_events add column if not exists campaign text;
alter table shop_events add column if not exists paid boolean not null default false;
alter table orders add column if not exists traffic_channel text;
alter table orders add column if not exists traffic_campaign text;
alter table orders add column if not exists traffic_paid boolean not null default false;
create index if not exists shop_events_seller_channel_idx on shop_events (seller_id, created_at, channel);

create or replace function public.norm_channel(_c text) returns text language sql immutable as $$
  select case when _c in ('facebook', 'instagram', 'tiktok', 'google', 'whatsapp', 'youtube', 'x', 'snapchat', 'email', 'sms', 'autre_site', 'direct')
              then _c else 'direct' end
$$;

drop function if exists public.track_shop_event(text, uuid, text, text, text);
create or replace function public.track_shop_event(
  _kind text, _product uuid, _seller_slug text, _visitor text, _source text default null,
  _channel text default null, _campaign text default null, _paid boolean default false
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare sid uuid; pid uuid := _product; src text;
begin
  if _kind not in ('shop', 'product', 'cart') or coalesce(length(_visitor), 0) not between 8 and 64 then return; end if;
  src := case when _source in ('search', 'category', 'home', 'shop', 'product', 'external', 'direct', 'other') then _source else 'other' end;
  if pid is not null then
    select seller_id into sid from products where id = pid and is_published;
  elsif _seller_slug is not null then
    select id into sid from sellers where slug = _seller_slug and is_active;
  end if;
  if sid is null then return; end if;
  if exists (
    select 1 from shop_events
    where visitor_id = _visitor and kind = _kind and seller_id = sid
      and product_id is not distinct from pid and created_at > now() - interval '30 minutes'
  ) then return; end if;
  insert into shop_events (seller_id, product_id, visitor_id, kind, source, channel, campaign, paid)
  values (sid, pid, _visitor, _kind, src, public.norm_channel(_channel), nullif(left(trim(coalesce(_campaign, '')), 80), ''), coalesce(_paid, false));
end $function$;
grant execute on function public.track_shop_event(text, uuid, text, text, text, text, text, boolean) to anon, authenticated;

-- Provenance d'une commande : uniquement par son auteur, juste après la commande, une seule fois
create or replace function public.set_order_attribution(_order_number text, _channel text, _campaign text default null, _paid boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update orders set traffic_channel = public.norm_channel(_channel),
                    traffic_campaign = nullif(left(trim(coalesce(_campaign, '')), 80), ''),
                    traffic_paid = coalesce(_paid, false)
  where order_number = _order_number
    and traffic_channel is null
    and created_at > now() - interval '30 minutes'
    and (user_id is null or user_id = auth.uid());
end $$;
grant execute on function public.set_order_attribution(text, text, text, boolean) to anon, authenticated;

-- Performances par source et par campagne, pour le vendeur connecté
create or replace function public.seller_traffic_sources(_days int default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  sid uuid;
  d int := case when _days in (1, 7, 30, 365) then _days else 30 end;
  t_start timestamptz;
  res jsonb;
begin
  select id into sid from sellers where owner_id = auth.uid();
  if sid is null then return null; end if;
  t_start := case when d = 1 then date_trunc('day', now()) else now() - make_interval(days => d) end;

  with ev as (
    select coalesce(channel, case when source = 'external' then 'autre_site' else 'direct' end) as ch,
           campaign, paid, kind, visitor_id
    from shop_events where seller_id = sid and created_at >= t_start
  ),
  ord as (
    select coalesce(o.traffic_channel, 'direct') as ch, o.traffic_campaign as campaign, o.traffic_paid as paid,
           oi.order_id, oi.quantity, (oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) as amount
    from order_items oi join orders o on o.id = oi.order_id
    where oi.seller_id = sid and oi.created_at >= t_start
      and o.status <> 'Annulée' and oi.seller_status <> 'cancelled'
  ),
  ev_ch as (
    select ch,
           count(distinct visitor_id) as visitors,
           count(*) filter (where kind in ('shop', 'product')) as visits,
           count(*) filter (where kind = 'cart') as carts,
           count(distinct visitor_id) filter (where paid) as paid_visitors
    from ev group by ch
  ),
  ord_ch as (
    select ch, count(distinct order_id) as orders, sum(quantity) as units, sum(amount) as revenue,
           count(distinct order_id) filter (where paid) as paid_orders
    from ord group by ch
  ),
  ev_cp as (
    select ch, campaign, count(distinct visitor_id) as visitors,
           count(*) filter (where kind in ('shop', 'product')) as visits,
           count(*) filter (where kind = 'cart') as carts
    from ev where campaign is not null group by ch, campaign
  ),
  ord_cp as (
    select ch, campaign, count(distinct order_id) as orders, sum(amount) as revenue
    from ord where campaign is not null group by ch, campaign
  )
  select jsonb_build_object(
    'days', d,
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel', coalesce(e.ch, o.ch),
        'visitors', coalesce(e.visitors, 0), 'visits', coalesce(e.visits, 0), 'carts', coalesce(e.carts, 0),
        'paid_visitors', coalesce(e.paid_visitors, 0),
        'orders', coalesce(o.orders, 0), 'units', coalesce(o.units, 0), 'revenue', coalesce(o.revenue, 0),
        'paid_orders', coalesce(o.paid_orders, 0)
      ) order by coalesce(e.visitors, 0) desc, coalesce(o.orders, 0) desc)
      from ev_ch e full join ord_ch o on o.ch = e.ch
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel', coalesce(e.ch, o.ch), 'campaign', coalesce(e.campaign, o.campaign),
        'visitors', coalesce(e.visitors, 0), 'visits', coalesce(e.visits, 0), 'carts', coalesce(e.carts, 0),
        'orders', coalesce(o.orders, 0), 'revenue', coalesce(o.revenue, 0)
      ) order by coalesce(e.visitors, 0) desc)
      from ev_cp e full join ord_cp o on o.ch = e.ch and o.campaign = e.campaign
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;
grant execute on function public.seller_traffic_sources(int) to authenticated;
