-- Recommandations et classements du site client : toutes les ventes comptent, quel que soit le statut de la commande.
-- + ventes par catégorie (ordre des sections de l'accueil).
begin;

create or replace function public.product_signals()
 returns table(product_id uuid, units integer, buyers integer, views integer, carts integer)
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id,
         coalesce(s.units, 0)::int, coalesce(s.buyers, 0)::int,
         coalesce(v.views, 0)::int, coalesce(v.carts, 0)::int
  from products p
  left join (
    select oi.product_id, sum(oi.quantity) as units, count(distinct coalesce(o.user_id::text, o.contact_phone, o.id::text)) as buyers
    from order_items oi join orders o on o.id = oi.order_id
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
$function$;

create or replace function public.related_products(_product uuid, _limit integer default 24)
 returns table(product_id uuid, bought integer, viewed integer)
 language sql stable security definer set search_path to 'public'
as $function$
  with b as (
    select oi2.product_id, count(distinct oi.order_id) as n
    from order_items oi
    join order_items oi2 on oi2.order_id = oi.order_id and oi2.product_id <> oi.product_id
    where oi.product_id = _product
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
$function$;

-- Ventes par catégorie (nombre de commandes et d'articles), toutes commandes confondues
create or replace function public.category_sales()
 returns table(slug text, orders integer, units integer)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.slug, count(distinct oi.order_id)::int, coalesce(sum(oi.quantity), 0)::int
  from categories c
  left join products p on p.category_slug = c.slug
  left join order_items oi on oi.product_id = p.id
  where c.parent_id is null
  group by c.slug;
$function$;
grant execute on function public.category_sales() to anon, authenticated;

commit;
