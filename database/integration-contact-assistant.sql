-- Page Contact + assistant Amachia : messages clients et fonctions de lecture sûres pour l'assistant.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  name text not null,
  phone text,
  email text,
  topic text not null default 'Autre',
  order_number text,
  message text not null,
  source text not null default 'form',            -- form | assistant
  status text not null default 'new',             -- new | answered | closed
  admin_note text,
  handled_at timestamptz
);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

create or replace function public.support_contact(_name text, _phone text, _email text, _topic text, _order text, _message text, _source text default 'form') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g'); id uuid;
begin
  if length(btrim(coalesce(_name, ''))) < 2 then raise exception 'Indiquez votre nom.'; end if;
  if length(btrim(coalesce(_message, ''))) < 5 then raise exception 'Votre message est trop court.'; end if;
  if d = '' and coalesce(btrim(_email), '') = '' then raise exception 'Indiquez un téléphone ou un e-mail pour que nous puissions vous répondre.'; end if;
  if d <> '' then
    if length(d) > 9 and d like '237%' then d := substr(d, 4); end if;
    if length(d) <> 9 or left(d, 1) <> '6' then raise exception 'Le numéro doit contenir 9 chiffres et commencer par 6.'; end if;
  end if;
  -- anti-abus : 5 messages par heure et par contact
  if (select count(*) from support_messages where created_at > now() - interval '1 hour' and ((d <> '' and phone = d) or (coalesce(_email, '') <> '' and lower(email) = lower(_email)))) >= 5 then
    raise exception 'Vous avez déjà envoyé plusieurs messages : nous vous répondons très vite.';
  end if;
  insert into support_messages (user_id, name, phone, email, topic, order_number, message, source)
  values (auth.uid(), left(btrim(_name), 80), nullif(d, ''), nullif(lower(btrim(coalesce(_email, ''))), ''), left(coalesce(nullif(btrim(_topic), ''), 'Autre'), 60),
          nullif(upper(btrim(coalesce(_order, ''))), ''), left(btrim(_message), 2000), case when _source = 'assistant' then 'assistant' else 'form' end)
  returning support_messages.id into id;
  return jsonb_build_object('ok', true, 'ref', 'MSG-' || upper(left(replace(id::text, '-', ''), 6)));
end $$;
grant execute on function public.support_contact(text, text, text, text, text, text, text) to anon, authenticated;

-- admin : messages reçus
create or replace function public.admin_support_messages(_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_support_messages');
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from support_messages m
    where _status = 'all' or (_status = 'open' and m.status = 'new') or m.status = _status), '[]'::jsonb);
end $$;
create or replace function public.admin_support_update(_id uuid, _status text, _note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_support_update');
  if _status not in ('new', 'answered', 'closed') then raise exception 'Statut inconnu'; end if;
  update support_messages set status = _status, admin_note = coalesce(nullif(btrim(_note), ''), admin_note), handled_at = case when _status = 'new' then null else now() end where id = _id;
end $$;

-- ===== Fonctions de l'assistant (lecture seule, réponses exactes depuis la base) =====
create or replace function public.assistant_products(_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('titre', p.title, 'prix_fcfa', p.price_fcfa, 'prix_barre_fcfa', p.original_price_fcfa,
      'en_stock', p.stock > 0, 'stock', p.stock, 'marque', p.brand, 'categorie', p.category_slug, 'note', p.rating, 'avis', p.reviews_count,
      'vendeur', s.name, 'lien', '/product/' || coalesce(p.slug, p.id::text)) x
    from products p left join sellers s on s.id = p.seller_id
    where p.is_published and (
      p.title ilike '%' || btrim(_q) || '%' or p.brand ilike '%' || btrim(_q) || '%' or p.category_slug ilike '%' || btrim(_q) || '%'
      or (select bool_and(p.title ilike '%' || w || '%') from unnest(string_to_array(lower(btrim(_q)), ' ')) w where length(w) > 2))
    order by (p.stock > 0) desc, p.sales desc nulls last limit 6) t;
$$;

create or replace function public.assistant_order(_number text, _contact text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders; c text := lower(btrim(coalesce(_contact, ''))); d text := regexp_replace(coalesce(_contact, ''), '\D', '', 'g'); dl deliveries;
begin
  select * into o from orders where upper(order_number) = upper(btrim(_number));
  if o.id is null then return jsonb_build_object('trouvee', false, 'raison', 'Aucune commande avec ce numéro.'); end if;
  if length(d) > 9 and d like '237%' then d := substr(d, 4); end if;
  -- vérification : e-mail ou téléphone de la commande (protège les informations du client)
  if not (lower(coalesce(o.contact_email, '')) = c or (length(d) = 9 and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9) = d)
          or exists (select 1 from profiles p where p.id = o.user_id and (lower(coalesce(p.email, '')) = c or (length(d) = 9 and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = d)))) then
    return jsonb_build_object('trouvee', false, 'raison', 'Le téléphone ou l''e-mail ne correspond pas à cette commande.');
  end if;
  select * into dl from deliveries where order_id = o.id;
  return jsonb_build_object('trouvee', true, 'numero', o.order_number, 'statut', order_step_label(o.step),
    'passee_le', to_char(o.created_at at time zone 'Africa/Douala', 'DD/MM/YYYY à HH24:MI'), 'total_fcfa', o.total_fcfa, 'paiement', o.payment_method,
    'livraison', case when o.shipping_mode = 'agency' then 'Agence ' || coalesce(o.shipping_agency_name, '') else concat_ws(', ', o.district, o.city) end,
    'livreur', case dl.status when 'assigned' then 'Un livreur a accepté la commande et va la récupérer chez le vendeur' when 'picked_up' then 'Le livreur a récupéré le colis' when 'in_transit' then 'Le livreur est en route vers vous' when 'delivered' then 'Livrée' when 'failed' then 'Tentative de livraison échouée' else 'Pas encore de livreur' end,
    'livree_le', to_char(o.delivered_at at time zone 'Africa/Douala', 'DD/MM/YYYY à HH24:MI'),
    'articles', (select jsonb_agg(jsonb_build_object('produit', i.product_title, 'quantite', i.quantity, 'prix_fcfa', i.unit_price_fcfa)) from order_items i where i.order_id = o.id),
    'suivi', (select jsonb_agg(e.label order by e.created_at) from order_events e where e.order_id = o.id and e.status not like 'return_%'));
end $$;

create or replace function public.assistant_delivery(_city text, _district text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q jsonb := delivery_quote_v2(_city, 20000, _district); s platform_settings;
begin
  select * into s from platform_settings where id = 1;
  return jsonb_build_object('ville', _city, 'quartier', _district, 'mode', case q->>'mode' when 'agency' then 'Expédition par agence de voyage' else 'Livraison à domicile par Amachia' end,
    'frais_fcfa', q->'fee', 'delai', q->>'delay_label', 'livraison_gratuite_des_fcfa', nullif((q->>'free_threshold')::int, 0),
    'agences', (select jsonb_agg(jsonb_build_object('nom', a.name, 'depot', concat_ws(', ', a.depot_district, a.depot_city), 'adresse', a.address, 'delai', a.delay_text))
                from shipping_agencies a where a.is_active and (_city = any(a.cities) or a.cities is null)),
    'prime', jsonb_build_object('prix_fcfa_par_mois', s.prime_price, 'livraison_gratuite', s.prime_free_shipping));
end $$;

grant execute on function public.assistant_products(text), public.assistant_order(text, text), public.assistant_delivery(text, text) to anon, authenticated;

-- accès admin : section « clients »
insert into public.admin_fn_sections (fn, sections) values ('admin_support_messages', array['clients']), ('admin_support_update', array['clients'])
on conflict (fn) do update set sections = excluded.sections;
