-- IA & Automatisation (espace admin) : analyses calculées en direct à partir des vraies données.
-- Qualité des fiches produits et des vendeurs, détection de fraude, activités suspectes, recommandations, réglages.
begin;

create table if not exists public.ia_settings (
  id int primary key default 1 check (id = 1),
  cod_high_amount integer not null default 200000,     -- commande « paiement à la livraison » jugée élevée (FCFA)
  max_orders_phone_24h integer not null default 3,     -- commandes d'un même numéro en 24 h avant alerte
  min_description integer not null default 150,        -- longueur minimale d'une bonne description (caractères)
  min_images integer not null default 3,               -- nombre minimal de photos d'une bonne fiche
  fraud_threshold integer not null default 40,         -- score de risque à partir duquel une commande est signalée
  assistant_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.ia_settings (id) values (1) on conflict do nothing;
alter table public.ia_settings enable row level security;

-- Score de qualité d'une fiche produit (0-100) et liste des points à corriger
create or replace function public.ia_product_quality(p public.products, s public.ia_settings)
returns jsonb language plpgsql stable set search_path = public as $$
declare score int := 0; issues jsonb := '[]'::jsonb; tl int := char_length(btrim(coalesce(p.title, '')));
  dl int := char_length(btrim(regexp_replace(coalesce(p.description, ''), '<[^>]+>', ' ', 'g')));
  ni int := case when jsonb_typeof(p.images) = 'array' then jsonb_array_length(p.images) else 0 end;
  ns int := case when jsonb_typeof(p.specs) = 'object' then (select count(*) from jsonb_object_keys(p.specs)) else 0 end;
  english boolean := p.title ~* '\m(with|for|and|the|wireless|display|camera|black|white|men''s|women''s|ready|built-in|portable|speaker|waterproof|battery)\M'
                     and p.title !~* '\m(avec|pour|et|sans|noir|blanc|homme|femme|écran|caméra)\M';
begin
  if tl between 25 and 120 then score := score + 20;
  elsif tl < 25 then issues := issues || jsonb_build_object('code', 'title_short', 'level', 'warning', 'text', 'Titre trop court : ajoutez la marque, le modèle et la caractéristique principale');
  else score := score + 10; issues := issues || jsonb_build_object('code', 'title_long', 'level', 'info', 'text', 'Titre trop long : il sera coupé dans Google'); end if;
  if english then score := score - 10; issues := issues || jsonb_build_object('code', 'title_en', 'level', 'warning', 'text', 'Titre en anglais : traduisez-le en français pour les clients et pour Google'); end if;
  if dl >= s.min_description then score := score + 20;
  elsif dl >= 50 then score := score + 10; issues := issues || jsonb_build_object('code', 'desc_short', 'level', 'warning', 'text', 'Description courte (' || dl || ' caractères) : visez au moins ' || s.min_description);
  else issues := issues || jsonb_build_object('code', 'desc_missing', 'level', 'critical', 'text', 'Description absente ou presque vide'); end if;
  if ni >= s.min_images then score := score + 20;
  elsif ni >= 1 then score := score + 10; issues := issues || jsonb_build_object('code', 'few_images', 'level', 'warning', 'text', ni || ' photo(s) seulement : ajoutez-en au moins ' || s.min_images);
  else issues := issues || jsonb_build_object('code', 'no_image', 'level', 'critical', 'text', 'Aucune photo'); end if;
  if nullif(btrim(coalesce(p.brand, '')), '') is not null then score := score + 10;
  else issues := issues || jsonb_build_object('code', 'no_brand', 'level', 'info', 'text', 'Marque non renseignée'); end if;
  if p.subcategory_slug is not null then score := score + 10;
  else issues := issues || jsonb_build_object('code', 'no_sub', 'level', 'warning', 'text', 'Sous-catégorie non renseignée : le produit n''apparaît pas dans son rayon'); end if;
  if ns >= 3 then score := score + 10;
  else issues := issues || jsonb_build_object('code', 'few_specs', 'level', 'info', 'text', 'Peu de caractéristiques techniques (' || ns || ')'); end if;
  if p.stock > 0 then score := score + 10;
  else issues := issues || jsonb_build_object('code', 'out_of_stock', 'level', 'critical', 'text', 'En rupture de stock : invisible à l''achat'); end if;
  return jsonb_build_object('score', greatest(0, least(100, score)), 'issues', issues, 'english', english);
end $$;

-- Page « Optimisation produits »
create or replace function public.admin_ia_products()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ia_settings;
begin
  perform public.admin_guard('admin_ia_products');
  select * into s from ia_settings where id = 1;
  return coalesce((select jsonb_agg(x order by (x->>'score')::int, x->>'title') from (
    select jsonb_build_object('id', p.id, 'slug', coalesce(p.slug, p.id::text), 'title', p.title, 'image', p.images->>0, 'price', p.price_fcfa, 'stock', p.stock,
      'brand', p.brand, 'category', c.name, 'subcategory', sc.name, 'seller', se.name, 'seller_id', se.id, 'updated_at', p.updated_at,
      'views_30d', (select count(*) from shop_events e where e.product_id = p.id and e.kind = 'product' and e.created_at > now() - interval '30 days'),
      'carts_30d', (select count(*) from shop_events e where e.product_id = p.id and e.kind = 'cart' and e.created_at > now() - interval '30 days'),
      'sold_30d', (select coalesce(sum(oi.quantity), 0) from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.status <> 'Annulée' and o.created_at > now() - interval '30 days'),
      'linked', exists (select 1 from seller_products sp where sp.marketplace_product_id = p.id))
      || public.ia_product_quality(p, s) x
    from products p left join categories c on c.slug = p.category_slug left join subcategories sc on sc.slug = p.subcategory_slug left join sellers se on se.id = p.seller_id
    where p.is_published) t), '[]'::jsonb);
end $$;

-- Détail d'un produit pour l'optimisation par l'IA
create or replace function public.admin_ia_product(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p products; s ia_settings;
begin
  perform public.admin_guard('admin_ia_products');
  select * into p from products where id = _id;
  if p.id is null then raise exception 'Produit introuvable.'; end if;
  select * into s from ia_settings where id = 1;
  return jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description, 'brand', p.brand, 'price', p.price_fcfa, 'specs', p.specs,
    'category', (select name from categories where slug = p.category_slug), 'subcategory', (select name from subcategories where slug = p.subcategory_slug),
    'images', case when jsonb_typeof(p.images) = 'array' then jsonb_array_length(p.images) else 0 end) || public.ia_product_quality(p, s);
end $$;

-- Appliquer le titre / la description proposés (fiche Amachia + fiche du vendeur si elle existe)
create or replace function public.admin_ia_apply_product(_id uuid, _title text, _description text)
returns void language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(_title, '')); d text := coalesce(_description, '');
begin
  perform public.admin_guard('admin_ia_apply_product');
  if char_length(t) < 5 or char_length(t) > 200 then raise exception 'Titre invalide (5 à 200 caractères).'; end if;
  update products set title = t, description = d where id = _id;
  if not found then raise exception 'Produit introuvable.'; end if;
  update seller_products set name = t, description = d where marketplace_product_id = _id;
end $$;

-- Page « IA optimisation vendeur »
create or replace function public.admin_ia_sellers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ia_settings;
begin
  perform public.admin_guard('admin_ia_sellers');
  select * into s from ia_settings where id = 1;
  return coalesce((select jsonb_agg(x order by (x->>'score')::int) from (
    select jsonb_build_object('id', se.id, 'name', se.name, 'slug', se.slug, 'logo', se.logo_url, 'city', se.city, 'kyc', se.kyc_status, 'active', se.is_active,
      'products', q.n, 'avg_quality', q.avg_q, 'weak_products', q.weak, 'out_of_stock', q.oos,
      'orders_30d', o.n, 'cancel_rate', o.cancel_rate, 'delivered', o.delivered, 'rating', se.rating, 'reviews', se.reviews_count,
      'reports', (select count(*) from product_reports r where r.seller_id = se.id and r.status = 'pending'),
      'score', greatest(0, least(100, round(coalesce(q.avg_q, 0) * 0.6 + (1 - coalesce(o.cancel_rate, 0)) * 25 + case when se.kyc_status = 'approved' then 15 else 0 end))),
      'issues', (select coalesce(jsonb_agg(i), '[]'::jsonb) from (
        select 'Aucun produit en ligne' i where q.n = 0
        union all select q.weak || ' fiche(s) de faible qualité (score < 50)' where q.weak > 0
        union all select q.oos || ' produit(s) en rupture de stock' where q.oos > 0
        union all select 'Taux d''annulation élevé : ' || round(o.cancel_rate * 100) || ' %' where o.cancel_rate > 0.2
        union all select 'Vérification d''identité (KYC) non validée' where coalesce(se.kyc_status, '') <> 'approved'
        union all select 'Signalements en attente' where exists (select 1 from product_reports r where r.seller_id = se.id and r.status = 'pending')) z)) x
    from sellers se
    cross join lateral (select count(*) n, round(avg((public.ia_product_quality(p, s)->>'score')::int)) avg_q,
        count(*) filter (where (public.ia_product_quality(p, s)->>'score')::int < 50) weak, count(*) filter (where p.stock <= 0) oos
      from products p where p.seller_id = se.id and p.is_published) q
    cross join lateral (select count(distinct oi.order_id) n,
        count(*) filter (where oi.seller_status = 'delivered') delivered,
        case when count(*) > 0 then (count(*) filter (where oi.seller_status = 'cancelled'))::numeric / count(*) end cancel_rate
      from order_items oi join orders od on od.id = oi.order_id where oi.seller_id = se.id and od.created_at > now() - interval '30 days') o) t), '[]'::jsonb);
end $$;

-- Page « Détection fraude » : score de risque des commandes récentes
create or replace function public.admin_ia_fraud(_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ia_settings;
begin
  perform public.admin_guard('admin_ia_fraud');
  select * into s from ia_settings where id = 1;
  return jsonb_build_object('threshold', s.fraud_threshold, 'orders', coalesce((select jsonb_agg(x order by (x->>'score')::int desc, x->>'created_at' desc) from (
    select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status, 'total', o.total_fcfa,
      'customer', o.full_name, 'phone', o.contact_phone, 'city', o.city, 'payment', o.payment_method, 'guest', o.is_guest,
      'score', least(100, r.score), 'reasons', r.reasons) x
    from orders o
    cross join lateral (
      select coalesce(sum(w), 0)::int score, coalesce(jsonb_agg(t) filter (where t is not null), '[]'::jsonb) reasons from (
        select 30 w, 'Le même numéro a passé ' || count(*) || ' commandes en 24 h' t from orders o2
          where o2.contact_phone = o.contact_phone and o2.created_at between o.created_at - interval '24 hours' and o.created_at + interval '24 hours'
          having count(*) >= s.max_orders_phone_24h
        union all select 25, 'Paiement à la livraison d''un montant élevé (' || o.total_fcfa || ' FCFA)'
          where o.payment_method ilike '%livraison%' and o.total_fcfa >= s.cod_high_amount
        union all select 10, 'Commande sans compte d''un montant élevé' where coalesce(o.is_guest, false) and o.total_fcfa >= s.cod_high_amount
        union all select 30, count(*) || ' commande(s) annulée(s) auparavant avec ce numéro' from orders o3
          where o3.contact_phone = o.contact_phone and o3.id <> o.id and o3.status = 'Annulée' and o3.created_at < o.created_at having count(*) >= 2
        union all select 20, count(distinct lower(btrim(o4.full_name))) || ' noms différents pour ce numéro' from orders o4
          where o4.contact_phone = o.contact_phone and o4.created_at > o.created_at - interval '30 days' having count(distinct lower(btrim(o4.full_name))) > 1
        union all select 15, 'Numéro de téléphone au format inhabituel' where regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g') !~ '^(237)?6\d{8}$'
        union all select 15, 'Échecs de livraison précédents avec ce numéro' from deliveries d join orders o5 on o5.id = d.order_id
          where o5.contact_phone = o.contact_phone and d.status = 'failed' and o5.id <> o.id having count(*) >= 1
      ) z) r
    where o.created_at > now() - make_interval(days => greatest(1, least(365, coalesce(_days, 30)))) and r.score > 0) t), '[]'::jsonb));
end $$;

-- Page « Activités suspectes »
create or replace function public.admin_ia_suspicious()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_ia_suspicious');
  return coalesce((select jsonb_agg(x order by x->>'at' desc nulls last) from (
    -- connexion admin depuis une adresse IP jamais vue pour ce compte
    select jsonb_build_object('kind', 'admin_new_ip', 'level', 'warning', 'at', l.created_at, 'title', 'Connexion admin depuis une nouvelle adresse IP',
      'detail', coalesce(l.email, '?') || ' · IP ' || coalesce(l.ip, '?'), 'link', '/admin/equipe/connexions') x
    from admin_login_log l
    where l.created_at > now() - interval '14 days' and l.ip is not null
      and not exists (select 1 from admin_login_log p where p.user_id = l.user_id and p.ip = l.ip and p.created_at < l.created_at)
      and exists (select 1 from admin_login_log p where p.user_id = l.user_id and p.created_at < l.created_at)
    union all
    -- suppressions faites dans l'admin
    select jsonb_build_object('kind', 'admin_delete', 'level', 'info', 'at', a.created_at, 'title', 'Suppression dans l''admin',
      'detail', coalesce(st.full_name, st.email, '?') || ' · ' || replace(a.target, 'admin_', '') || coalesce(' · ' || a.page, ''), 'link', '/admin/equipe/activite')
    from admin_activity a left join admin_staff st on st.user_id = a.user_id
    where a.created_at > now() - interval '7 days' and a.target ~ '^admin_(delete|remove)'
    union all
    -- plusieurs comptes clients avec le même numéro
    select jsonb_build_object('kind', 'shared_phone', 'level', 'warning', 'at', max(p.created_at), 'title', count(*) || ' comptes clients avec le même numéro',
      'detail', 'Numéro ' || p.phone || ' · ' || string_agg(coalesce(p.full_name, p.email, '?'), ', '), 'link', '/admin/clients/liste')
    from profiles p where nullif(btrim(coalesce(p.phone, '')), '') is not null group by p.phone having count(*) > 1
    union all
    -- visiteur qui consulte un nombre anormal de fiches (robot de copie de catalogue)
    select jsonb_build_object('kind', 'scraper', 'level', 'warning', 'at', max(e.created_at), 'title', 'Navigation anormale (possible robot)',
      'detail', count(*) || ' fiches produits vues en 24 h par le même visiteur', 'link', '/admin/live')
    from shop_events e where e.created_at > now() - interval '24 hours' and e.kind = 'product' and e.visitor_id is not null
    group by e.visitor_id having count(*) >= 150
    union all
    -- retours à répétition
    select jsonb_build_object('kind', 'many_returns', 'level', 'warning', 'at', max(r.created_at), 'title', count(*) || ' demandes de retour du même client en 30 jours',
      'detail', coalesce(max(p.full_name), max(p.email), 'Client'), 'link', '/admin/commandes/retours')
    from return_requests r left join profiles p on p.id = r.user_id where r.created_at > now() - interval '30 days' and r.user_id is not null
    group by r.user_id having count(*) >= 3
    union all
    -- produit signalé plusieurs fois
    select jsonb_build_object('kind', 'reported', 'level', case when count(*) >= 3 then 'critical' else 'warning' end, 'at', max(r.created_at),
      'title', count(*) || ' signalement(s) en attente sur un produit', 'detail', coalesce(max(pr.title), 'Produit'), 'link', '/admin/produits/signalements')
    from product_reports r left join products pr on pr.id = coalesce(r.listing_id, r.product_id)
    where r.status = 'pending' group by coalesce(r.listing_id, r.product_id)
  ) t), '[]'::jsonb);
end $$;

-- Page « Recommandations » : actions concrètes, classées par priorité
create or replace function public.admin_ia_recommendations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ia_settings; out jsonb := '[]'::jsonb; n int; v int;
begin
  perform public.admin_guard('admin_ia_recommendations');
  select * into s from ia_settings where id = 1;
  select count(*) into n from orders where status = 'Commande reçue' and created_at < now() - interval '24 hours';
  if n > 0 then out := out || jsonb_build_object('priority', 1, 'icon', 'order', 'title', n || ' commande(s) en attente depuis plus de 24 h', 'detail', 'Confirmez-les ou relancez les vendeurs : un client qui attend annule plus souvent.', 'link', '/commandes'); end if;
  select count(*) into n from products p where p.is_published and p.stock <= 0
    and exists (select 1 from shop_events e where e.product_id = p.id and e.kind = 'product' and e.created_at > now() - interval '7 days');
  if n > 0 then out := out || jsonb_build_object('priority', 1, 'icon', 'stock', 'title', n || ' produit(s) en rupture encore consultés cette semaine', 'detail', 'Des clients les regardent mais ne peuvent pas les acheter : demandez aux vendeurs de réapprovisionner.', 'link', '/admin/ia/optimisation'); end if;
  select count(*) into n from products p where p.is_published and (public.ia_product_quality(p, s)->>'score')::int < 50;
  if n > 0 then out := out || jsonb_build_object('priority', 2, 'icon', 'quality', 'title', n || ' fiche(s) produit de faible qualité', 'detail', 'Titres, descriptions, photos ou caractéristiques à compléter : l''optimisation IA peut réécrire titre et description en un clic.', 'link', '/admin/ia/optimisation'); end if;
  select count(*) into n from products p where p.is_published and (public.ia_product_quality(p, s)->>'english')::boolean;
  if n > 0 then out := out || jsonb_build_object('priority', 2, 'icon', 'lang', 'title', n || ' titre(s) de produit en anglais', 'detail', 'Les clients camerounais et Google cherchent en français : traduisez-les avec l''optimisation IA.', 'link', '/admin/ia/optimisation'); end if;
  select count(*) filter (where kind = 'cart'), count(*) filter (where kind = 'product') into n, v from shop_events where created_at > now() - interval '7 days';
  if n > 0 then
    out := out || jsonb_build_object('priority', 3, 'icon', 'cart', 'title', n || ' ajout(s) au panier cette semaine pour ' ||
      (select count(*) from orders where created_at > now() - interval '7 days' and status <> 'Annulée') || ' commande(s)',
      'detail', 'Rappelez les avantages au panier (paiement à la livraison, points, livraison rapide) et suivez les paniers abandonnés.', 'link', '/admin/analytics/ventes');
  end if;
  select count(*) into n from orders o where o.status = 'Livrée' and o.delivered_at < now() - interval '3 days' and o.user_id is not null
    and not exists (select 1 from order_items oi join reviews r on r.product_id = oi.product_id and r.user_id = o.user_id where oi.order_id = o.id);
  if n > 0 then out := out || jsonb_build_object('priority', 3, 'icon', 'review', 'title', n || ' commande(s) livrée(s) sans avis client', 'detail', 'Les avis rassurent les acheteurs et affichent des étoiles dans Google : relancez ces clients (les avis rapportent des points).', 'link', '/avis-feedback'); end if;
  select count(*) into n from sellers where coalesce(kyc_status, '') = 'pending';
  if n > 0 then out := out || jsonb_build_object('priority', 2, 'icon', 'seller', 'title', n || ' vendeur(s) en attente de vérification d''identité', 'detail', 'Validez leurs documents pour qu''ils puissent vendre sereinement.', 'link', '/admin/vendeurs/kyc'); end if;
  select count(*) into n from product_reports where status = 'pending';
  if n > 0 then out := out || jsonb_build_object('priority', 1, 'icon', 'report', 'title', n || ' signalement(s) de produit à traiter', 'detail', 'Un produit signalé non traité nuit à la confiance des clients.', 'link', '/admin/produits/signalements'); end if;
  select count(*) into n from return_requests where status in ('pending', 'requested', 'open');
  if n > 0 then out := out || jsonb_build_object('priority', 2, 'icon', 'return', 'title', n || ' demande(s) de retour en attente', 'detail', 'Traitez-les rapidement : un retour bien géré fidélise le client.', 'link', '/admin/commandes/retours'); end if;
  select count(*) into n from subcategories sc where sc.is_active and not exists (select 1 from products p where p.subcategory_slug = sc.slug and p.is_published);
  if n > 0 then out := out || jsonb_build_object('priority', 4, 'icon', 'catalog', 'title', n || ' sous-catégorie(s) sans aucun produit', 'detail', 'Recrutez des vendeurs sur ces rayons : chaque rayon rempli est une page de plus dans Google.', 'link', '/admin/catalogue/sous-categories'); end if;
  select count(*) into n from categories c where c.parent_id is null and c.image_url is null;
  if n > 0 then out := out || jsonb_build_object('priority', 4, 'icon', 'image', 'title', n || ' catégorie(s) sans bannière', 'detail', 'Ajoutez une bannière dans Catalogue › Catégories.', 'link', '/categories'); end if;
  return coalesce((select jsonb_agg(e order by (e->>'priority')::int) from jsonb_array_elements(out) e), '[]'::jsonb);
end $$;

-- Réglages IA
create or replace function public.admin_ia_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_ia_settings');
  return (select to_jsonb(s) - 'id' from ia_settings s where id = 1);
end $$;

create or replace function public.admin_save_ia_settings(_s jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_save_ia_settings');
  update ia_settings set
    cod_high_amount = greatest(1000, coalesce((_s->>'cod_high_amount')::int, cod_high_amount)),
    max_orders_phone_24h = greatest(2, least(50, coalesce((_s->>'max_orders_phone_24h')::int, max_orders_phone_24h))),
    min_description = greatest(20, least(2000, coalesce((_s->>'min_description')::int, min_description))),
    min_images = greatest(1, least(12, coalesce((_s->>'min_images')::int, min_images))),
    fraud_threshold = greatest(10, least(100, coalesce((_s->>'fraud_threshold')::int, fraud_threshold))),
    assistant_enabled = coalesce((_s->>'assistant_enabled')::boolean, assistant_enabled),
    updated_at = now()
  where id = 1;
end $$;

-- Assistant IA : réglage lu par le serveur de l'assistant (admin connecté uniquement)
create or replace function public.admin_ia_assistant_check()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_ia_assistant');
  return jsonb_build_object('enabled', (select assistant_enabled from ia_settings where id = 1),
    'name', (select coalesce(full_name, email) from admin_staff where user_id = auth.uid()));
end $$;

insert into public.admin_fn_sections (fn, sections) values
  ('admin_ia_products', array['ia']), ('admin_ia_apply_product', array['ia']), ('admin_ia_sellers', array['ia', 'vendeurs']),
  ('admin_ia_fraud', array['ia']), ('admin_ia_suspicious', array['ia', 'securite']), ('admin_ia_recommendations', array['ia']),
  ('admin_ia_settings', array['ia', 'parametres']), ('admin_save_ia_settings', array['ia', 'parametres']), ('admin_ia_assistant', array['ia'])
on conflict (fn) do update set sections = excluded.sections;

revoke all on function public.ia_product_quality(public.products, public.ia_settings) from public, anon, authenticated;
commit;
