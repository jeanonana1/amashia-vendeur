-- Recommandations fondées sur des données réelles :
-- ventes (commandes non annulées), visites et ajouts au panier mesurés,
-- achats groupés et produits vus par les mêmes visiteurs.
-- Seuls des totaux sont exposés (aucune donnée client).

create or replace function public.product_signals()
returns table(product_id uuid, units int, buyers int, views int, carts int)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(s.units, 0)::int, coalesce(s.buyers, 0)::int,
         coalesce(v.views, 0)::int, coalesce(v.carts, 0)::int
  from products p
  left join (
    select oi.product_id, sum(oi.quantity) as units, count(distinct o.user_id) as buyers
    from order_items oi join orders o on o.id = oi.order_id
    where coalesce(oi.seller_status, 'pending') <> 'cancelled'
      and oi.created_at > now() - interval '180 days'
    group by oi.product_id
  ) s on s.product_id = p.id
  left join (
    select e.product_id,
           count(distinct e.visitor_id) filter (where e.kind = 'product') as views,
           count(distinct e.visitor_id) filter (where e.kind = 'cart') as carts
    from shop_events e
    where e.product_id is not null and e.created_at > now() - interval '90 days'
    group by e.product_id
  ) v on v.product_id = p.id
  where p.is_published;
$$;

-- Produits liés à un produit : achetés dans les mêmes commandes, ou consultés par les mêmes visiteurs
create or replace function public.related_products(_product uuid, _limit int default 24)
returns table(product_id uuid, bought int, viewed int)
language sql stable security definer set search_path = public as $$
  with b as (
    select oi2.product_id, count(distinct oi.order_id) as n
    from order_items oi
    join order_items oi2 on oi2.order_id = oi.order_id and oi2.product_id <> oi.product_id
    where oi.product_id = _product
      and coalesce(oi.seller_status, 'pending') <> 'cancelled'
      and coalesce(oi2.seller_status, 'pending') <> 'cancelled'
    group by oi2.product_id
  ), v as (
    select e2.product_id, count(distinct e2.visitor_id) as n
    from shop_events e
    join shop_events e2 on e2.visitor_id = e.visitor_id and e2.product_id is not null
      and e2.product_id <> e.product_id and e2.kind in ('product', 'cart')
    where e.product_id = _product and e.kind in ('product', 'cart')
      and e.created_at > now() - interval '90 days' and e2.created_at > now() - interval '90 days'
    group by e2.product_id
  )
  select p.id, coalesce(b.n, 0)::int, coalesce(v.n, 0)::int
  from products p
  left join b on b.product_id = p.id
  left join v on v.product_id = p.id
  where p.is_published and (b.n is not null or v.n is not null)
  order by coalesce(b.n, 0) desc, coalesce(v.n, 0) desc
  limit greatest(1, least(coalesce(_limit, 24), 60));
$$;

grant execute on function public.product_signals() to anon, authenticated;
grant execute on function public.related_products(uuid, int) to anon, authenticated;
