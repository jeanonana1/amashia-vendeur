-- La vue seller_orders est la seule porte d'accès des vendeurs aux commandes (la lecture directe de orders leur est
-- fermée depuis integration-admin-10). Elle doit donc s'exécuter avec les droits de son propriétaire ; le filtre
-- s.owner_id = auth.uid() la limite aux articles du vendeur connecté (nom du client et quartier seulement).
alter view public.seller_orders set (security_invoker = false);
revoke all on public.seller_orders from anon;
grant select on public.seller_orders to authenticated;
