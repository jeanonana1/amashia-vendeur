-- Amachia — Utiliser ses points récompense au paiement (1 point = 1 FCFA), au choix à la place d'un code promo.
-- La réduction est prise en charge par Amachia : le montant revenant aux vendeurs ne change pas.

alter table public.orders add column if not exists points_used integer not null default 0 check (points_used >= 0);

-- Le total tient compte des points utilisés
create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid; sub integer; disc integer;
begin
  oid := coalesce(new.order_id, old.order_id);
  select coalesce(sum(unit_price_fcfa * quantity), 0), coalesce(sum(discount_fcfa), 0) into sub, disc
    from public.order_items where order_id = oid;
  update public.orders set subtotal_fcfa = sub, discount_fcfa = disc,
    total_fcfa = greatest(0, sub + shipping_fee_fcfa - disc - coalesce(points_used, 0)) where id = oid;
  return null;
end $$;

-- Solde de points du client connecté
create or replace function public.customer_points_balance() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(sum(points), 0))::int from public.reward_transactions where user_id = auth.uid()
$$;
revoke execute on function public.customer_points_balance() from public, anon;
grant execute on function public.customer_points_balance() to authenticated;

-- Paiement : utilisation des points (vérifiée en base : solde réel, plafonnée au montant à payer)
do $$
declare def text;
begin
  def := pg_get_functiondef('public.customer_checkout(uuid,jsonb,jsonb)'::regprocedure);
  if position('points_used' in def) = 0 then
    def := replace(def, 'DECLARE uid uuid:=auth.uid();', 'DECLARE bal integer; use_ integer; uid uuid:=auth.uid();');
    def := replace(def, ' -- Les points récompense ne sont plus donnés à la commande', $x$ -- Points récompense utilisés (au choix à la place d'un code promo)
 IF promo='' AND coalesce(nullif(p_details->>'points','')::int,0) > 0 THEN
  SELECT coalesce(sum(points),0) INTO bal FROM public.reward_transactions WHERE user_id=uid;
  SELECT least((p_details->>'points')::int, bal, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa) INTO use_ FROM public.orders WHERE id=oid;
  IF use_ > 0 THEN
   UPDATE public.orders SET points_used=use_, total_fcfa=greatest(0, subtotal_fcfa+shipping_fee_fcfa-discount_fcfa-use_) WHERE id=oid;
   INSERT INTO public.reward_transactions(user_id,points,type,description,order_id) VALUES (uid,-use_,'redeem','Points utilisés pour payer la commande',oid);
  END IF;
 END IF;
 -- Les points récompense ne sont plus donnés à la commande$x$);
    execute def;
  end if;
end $$;

-- Annulation par l'admin : les points utilisés sont rendus au client (une seule fois)
do $$
declare def text;
begin
  def := pg_get_functiondef('public.admin_set_order_status(uuid,text)'::regprocedure);
  if position('redeem' in def) = 0 then
    def := replace(def, $x$    perform public.add_order_event(_order, 'cancelled', 'Commande annulée par Amachia');$x$, $x$    perform public.add_order_event(_order, 'cancelled', 'Commande annulée par Amachia');
    insert into public.reward_transactions (user_id, points, type, description, order_id)
    select o.user_id, o.points_used, 'cancellation', 'Points rendus (commande annulée)', o.id
    where o.points_used > 0 and not exists (select 1 from public.reward_transactions r where r.order_id = o.id and r.type = 'cancellation');$x$);
    execute def;
  end if;
end $$;
