-- Le statut des commandes est décidé uniquement par l'équipe Amachia (espace admin).
-- Les vendeurs ne peuvent plus le modifier ; ils le voient changer en direct.
revoke execute on function public.seller_set_order_status(uuid, text) from authenticated, anon, public;
-- Temps réel : le vendeur (ses articles) et le client (sa commande) voient le nouveau statut immédiatement
do $$ begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; end $$;
