-- Création de compte après une commande passée sans compte :
-- les commandes faites avec la même adresse e-mail (vérifiée) sont rattachées au nouveau compte
-- et leurs points récompense (1 % du montant, comme pour les clients inscrits) sont crédités.

create or replace function public.customer_claim_guest_orders() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); em text; n int := 0; pts int := 0; r record;
begin
  if uid is null then return jsonb_build_object('orders', 0, 'points', 0); end if;
  select lower(email) into em from auth.users where id = uid and (email_confirmed_at is not null or confirmed_at is not null);
  if em is null or em = '' then return jsonb_build_object('orders', 0, 'points', 0); end if;
  for r in select id, order_number, total_fcfa, status from orders
           where user_id is null and lower(contact_email) = em for update loop
    update orders set user_id = uid, is_guest = false where id = r.id;
    n := n + 1;
    if r.status <> 'Annulée' and coalesce(r.total_fcfa, 0) > 0
       and not exists (select 1 from reward_transactions t where t.order_id = r.id and t.type = 'cashback') then
      insert into reward_transactions (user_id, points, type, description, order_id)
      values (uid, floor(r.total_fcfa * 0.01), 'cashback', 'Cashback 1% commande ' || r.order_number, r.id);
      pts := pts + floor(r.total_fcfa * 0.01)::int;
    end if;
  end loop;
  return jsonb_build_object('orders', n, 'points', pts);
end $$;
revoke all on function public.customer_claim_guest_orders() from public, anon;
grant execute on function public.customer_claim_guest_orders() to authenticated;

-- points que gagnerait le client en créant son compte (affiché après la commande)
create or replace function public.guest_order_points(_order_number text, _email text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(floor(o.total_fcfa * 0.01), 0)::int from orders o
  where o.order_number = _order_number and lower(o.contact_email) = lower(_email) and o.user_id is null limit 1;
$$;
grant execute on function public.guest_order_points(text, text) to anon, authenticated;
