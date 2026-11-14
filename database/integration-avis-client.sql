-- Un avis publié ne peut plus être modifié ni supprimé par le client
drop policy if exists "Users edit own reviews" on reviews;
drop policy if exists "Users delete own reviews" on reviews;

-- Produits achetés (commandes non annulées) qui attendent encore l'avis du client,
-- avec les points récompense qu'il gagnera (1 % du montant payé, comme à la publication)
create or replace function public.customer_pending_reviews()
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select oi.product_id,
           max(oi.product_title) as title,
           max(o.created_at) as last_order,
           sum(round((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) * 0.01))::int as points
    from order_items oi join orders o on o.id = oi.order_id
    where o.user_id = auth.uid() and o.status <> 'Annulée' and oi.product_id is not null
    group by oi.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', m.product_id, 'slug', coalesce(p.slug, m.product_id::text), 'title', coalesce(p.title, m.title),
    'image', p.images ->> 0, 'points', greatest(m.points, 0), 'ordered_at', m.last_order
  ) order by m.last_order desc), '[]'::jsonb)
  from mine m
  left join products p on p.id = m.product_id
  where auth.uid() is not null
    and not exists (select 1 from reviews r where r.product_id = m.product_id and r.user_id = auth.uid());
$$;
grant execute on function public.customer_pending_reviews() to authenticated;

-- can_review indique aussi si le client a déjà donné son avis (avis définitif)
create or replace function public.can_review(_product uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'reviewed', exists (select 1 from reviews r where r.product_id = _product and r.user_id = auth.uid()),
    'purchased', exists (select 1 from order_items oi join orders o on o.id = oi.order_id
                         where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'),
    'points', coalesce((select sum(round((oi.unit_price_fcfa * coalesce(oi.quantity, 1) - coalesce(oi.discount_fcfa, 0)) * 0.01))::int
                        from order_items oi join orders o on o.id = oi.order_id
                        where oi.product_id = _product and o.user_id = auth.uid() and o.status <> 'Annulée'
                          and not exists (select 1 from reward_transactions rt where rt.order_id = o.id and rt.product_id = _product)), 0)
  )
$function$;
