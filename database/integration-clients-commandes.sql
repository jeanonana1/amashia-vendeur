-- Amachia : liste des clients du vendeur avec l'historique de leurs commandes
-- (un client = un compte ; aucune coordonnée personnelle n'est transmise).
begin;
create or replace function public.seller_customers()
returns jsonb language sql stable security definer set search_path = public as $$
  with sid as (select id from sellers where owner_id = auth.uid()),
  lines as (
    select o.user_id, o.full_name, o.city, o.district, o.created_at, o.id as order_id, o.order_number,
           oi.quantity, (oi.unit_price_fcfa * coalesce(oi.quantity, 1)) as amount, oi.product_title,
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
$$;
revoke execute on function public.seller_customers() from public, anon;
grant execute on function public.seller_customers() to authenticated;
commit;
