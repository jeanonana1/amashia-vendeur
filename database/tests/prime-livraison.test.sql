-- Tests du calcul de livraison Prime (delivery_quote_v3 / prime_apply_quote) et du parcours d'abonnement.
-- À lancer UNIQUEMENT sur une base de test locale (auth.uid() y est simulé par le réglage test.uid).
-- Tout se passe dans une transaction annulée à la fin : la base de test reste inchangée.
begin;

-- données de test
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'membre@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'nonmembre@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'expire@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'admin');
insert into public.admin_staff (user_id, status, is_super, last_seen_at) values ('00000000-0000-0000-0000-0000000000ad', 'active', true, now());
insert into public.prime_subscriptions (user_id, plan_id, status, is_active, starts_at, expires_at)
select '00000000-0000-0000-0000-0000000000a1', id, 'actif', true, now() - interval '1 day', now() + interval '29 days' from prime_plans limit 1;
insert into public.prime_subscriptions (user_id, plan_id, status, is_active, starts_at, expires_at)
select '00000000-0000-0000-0000-0000000000a3', id, 'actif', true, now() - interval '40 days', now() - interval '10 days' from prime_plans limit 1;
update public.prime_settings set enabled = true, home_cities = '{Yaoundé}', agencies_included = false, min_order_fcfa = 0, monthly_quota = 4,
  excluded_categories = '{}', excluded_products = '{}' where id = 1;

create temp table t_prods as select array_agg(id order by id) ids from (select id from products order by id limit 2) x;
create temp table t_result (n int, name text, ok boolean, detail text);

create function pg_temp.q(_uid text, _city text, _sub int, _district text default null) returns jsonb language sql as $$
  select set_config('test.uid', coalesce(_uid, ''), true);
  select public.delivery_quote_v3(_city, _sub, _district, null, (select ids from t_prods))
$$;
create function pg_temp.check(_n int, _name text, _ok boolean, _detail jsonb) returns void language sql as $$
  insert into t_result values (_n, _name, _ok, _detail::text)
$$;

do $$
declare r jsonb; normal int; m text := '00000000-0000-0000-0000-0000000000a1'; nm text := '00000000-0000-0000-0000-0000000000a2'; sid uuid;
begin
  -- 1. non-membre : frais réels (jamais gonflés), aucune mention Prime
  r := pg_temp.q(nm, 'Yaoundé', 10000, 'Bastos'); normal := (r->>'fee')::int;
  perform pg_temp.check(1, 'non-membre Yaoundé : frais normaux', normal > 0 and not (r->>'prime_included')::boolean and (r->>'standard_fee')::int = normal, r);
  -- 2. membre éligible : 0 FCFA, livraison incluse, coût réel conservé pour la comptabilité
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(2, 'membre éligible : livraison incluse', (r->>'fee')::int = 0 and (r->>'prime_included')::boolean and (r->>'prime_cost')::int = normal and r->>'prime_subscription_id' is not null, r);
  -- 3. membre hors zone (Douala, livrée à domicile mais pas dans les villes Prime)
  r := pg_temp.q(m, 'Douala', 10000);
  perform pg_temp.check(3, 'membre hors zone (Douala)', (r->>'fee')::int > 0 and not (r->>'prime_included')::boolean and r->>'prime_reason' = 'Hors zone Prime', r);
  -- 4. membre, envoi par agence (autre ville)
  r := pg_temp.q(m, 'Bafoussam', 10000);
  perform pg_temp.check(4, 'membre hors zone (agence)', not (r->>'prime_included')::boolean and r->>'prime_reason' like 'Hors zone Prime : envoi par agence%', r);
  -- 5. membre sous le minimum de commande
  update prime_settings set min_order_fcfa = 20000 where id = 1;
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(5, 'membre sous le minimum', (r->>'fee')::int = normal and not (r->>'prime_included')::boolean and r->>'prime_reason' like 'Sous le minimum Prime%', r);
  update prime_settings set min_order_fcfa = 0 where id = 1;
  -- 6. produit exclu (non éligible Prime)
  update products set is_prime = false where id = (select ids[1] from t_prods);
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(6, 'produit exclu', (r->>'fee')::int = normal and r->>'prime_reason' = 'Article exclu de la livraison incluse', r);
  update products set is_prime = true where id = (select ids[1] from t_prods);
  -- 6b. catégorie exclue
  update prime_settings set excluded_categories = array[(select category_slug from products where id = (select ids[1] from t_prods))] where id = 1;
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(6, 'catégorie exclue', r->>'prime_reason' = 'Article exclu de la livraison incluse', r);
  update prime_settings set excluded_categories = '{}' where id = 1;
  -- 7. abonnement expiré : traité comme non-membre
  r := pg_temp.q('00000000-0000-0000-0000-0000000000a3', 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(7, 'abonnement expiré', (r->>'fee')::int = normal and not (r->>'prime_member')::boolean, r);
  -- 8. quota mensuel atteint (4 livraisons incluses ce mois-ci)
  insert into orders (id, user_id, status, prime_delivery_included, created_at)
  select gen_random_uuid(), m::uuid, 'Livrée', true, now() from generate_series(1, 4);
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(8, 'quota du mois atteint', (r->>'fee')::int = normal and r->>'prime_reason' like 'Quota Prime du mois atteint%', r);
  delete from orders where user_id = m::uuid;
  -- 9. Prime désactivé par l'admin : plus aucune livraison incluse
  update prime_settings set enabled = false where id = 1;
  r := pg_temp.q(m, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(9, 'Prime désactivé', (r->>'fee')::int = normal and not (r->>'prime_included')::boolean, r);
  update prime_settings set enabled = true where id = 1;
  -- 10. seuil existant hors Prime (commande > seuil) : inchangé
  r := pg_temp.q(nm, 'Yaoundé', 60000, 'Bastos');
  perform pg_temp.check(10, 'seuil hors Prime inchangé', (r->>'fee')::int = 0 and not (r->>'prime_included')::boolean, r);

  -- 11. parcours : demande en attente → pas encore membre → activation admin → membre
  perform set_config('test.uid', nm, true);
  begin perform public.customer_prime_subscribe((select id from prime_plans limit 1), false, false, 'Orange Money');
        perform pg_temp.check(11, 'refus sans acceptation des conditions', false, '{}');
  exception when others then perform pg_temp.check(11, 'refus sans acceptation des conditions', sqlerrm like '%accepter les conditions%', to_jsonb(sqlerrm)); end;
  sid := public.customer_prime_subscribe((select id from prime_plans limit 1), true, false, 'Orange Money');
  r := pg_temp.q(nm, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(12, 'demande en attente : pas de livraison incluse', not (r->>'prime_included')::boolean and (public.customer_prime()->'pending') is not null, public.customer_prime()->'pending');
  begin perform public.admin_activate_prime(sid, 'TEST', null);
        perform pg_temp.check(13, 'client ne peut pas s''activer lui-même', false, '{}');
  exception when others then perform pg_temp.check(13, 'client ne peut pas s''activer lui-même', sqlerrm like '%administrateurs%', to_jsonb(sqlerrm)); end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', true);
  perform public.admin_activate_prime(sid, 'OM-123', null);
  r := pg_temp.q(nm, 'Yaoundé', 10000, 'Bastos');
  perform pg_temp.check(14, 'activé par l''admin : livraison incluse', (r->>'prime_included')::boolean, r);
  -- 15. résiliation : avantages conservés jusqu'à la fin de la période payée, renouvellement coupé
  perform set_config('test.uid', nm, true);
  perform pg_temp.check(15, 'résiliation', public.customer_prime_cancel() = 'resilie' and public.prime_active(nm::uuid)
    and not (select auto_renew from prime_subscriptions where id = sid), public.customer_prime()->'current');
  -- 16. e-mails : accusé de réception de la demande puis confirmation d'activation, une seule fois chacun
  perform pg_temp.check(16, 'e-mails Prime en file d''envoi', (select count(*) from email_outbox where prime_subscription_id = sid and kind in ('prime_requested', 'prime_activated')) = 2,
    (select jsonb_agg(kind) from email_outbox where prime_subscription_id = sid));
end $$;

select n, name, case when ok then 'OK' else 'ÉCHEC' end as resultat, case when ok then '' else detail end as detail from t_result order by n, name;
select count(*) filter (where not ok) as echecs, count(*) as total from t_result;
rollback;
