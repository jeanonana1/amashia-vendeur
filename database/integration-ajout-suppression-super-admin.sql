-- Sécurité admin : seuls les super administrateurs peuvent AJOUTER ou SUPPRIMER des éléments.

-- Les autres membres de l'équipe gardent la consultation et la modification des sections auxquelles ils ont accès.

begin;


create or replace function public.admin_super_only(_what text default 'ajouter ou supprimer')
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_staff where user_id = auth.uid() and is_super and status = 'active') then
    raise exception 'Action réservée au super administrateur : seul lui peut % des éléments dans l''admin.', _what using errcode = '42501';
  end if;
end $$;
revoke all on function public.admin_super_only(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_guard(_fn text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); s public.admin_staff; secs text[];
begin
  if uid is null or not exists (select 1 from public.user_roles where user_id = uid and role = 'admin') then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Double authentification requise : saisissez le code de votre application d''authentification.' using errcode = '42501';
  end if;
  select * into s from public.admin_staff where user_id = uid;
  if s.user_id is null or s.status <> 'active' then raise exception 'Compte administrateur désactivé.' using errcode = '42501'; end if;
  if greatest(coalesce(s.last_seen_at, '-infinity'),
       coalesce((select se.created_at from auth.sessions se where se.id = nullif(auth.jwt() ->> 'session_id', '')::uuid), '-infinity')) < now() - interval '1 hour' then
    raise exception 'Session verrouillée après 1 heure d''inactivité : reconnectez-vous.' using errcode = '42501';
  end if;
  -- ajout / suppression : super administrateur uniquement
  if not s.is_super and _fn ~ '^admin_(create|add|delete|remove|invite|new|import|duplicate)(_|$)' then
    raise exception 'Action réservée au super administrateur : seul lui peut ajouter ou supprimer des éléments dans l''admin.' using errcode = '42501';
  end if;
  if not s.is_super then
    select sections into secs from public.admin_fn_sections where fn = _fn;
    if secs is null then raise exception 'Action réservée aux super administrateurs.' using errcode = '42501'; end if;
    if not ('*' = any(secs) or secs && s.permissions) then raise exception 'Vous n''avez pas accès à cette section.' using errcode = '42501'; end if;
  end if;
  if _fn ~ '^admin_(save|set|delete|create|update|remove|invite|cancel|approve|reject|grant|revoke|toggle|mark|pay|refund|reset|send|suspend|assign|validate|accept|decide|process|resolve|reply|add|archive|restore|publish|block|unblock|verify|confirm|change|edit|upload|import|close|reopen|ban)(_|$)' then
    insert into public.admin_activity (user_id, kind, target, page, ip)
    values (uid, 'action', _fn, left(public.admin_req_header('x-amashia-page'), 200),
      split_part(coalesce(public.admin_req_header('x-forwarded-for'), ''), ',', 1));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_prime_plan(_id uuid, _name text, _months integer, _price integer, _description text, _benefits text[], _active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_prime_plan');
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom du plan.'; end if;
  if _months is null or _months < 1 or _months > 24 then raise exception 'Durée invalide (1 à 24 mois).'; end if;
  if _price is null or _price < 0 then raise exception 'Prix invalide.'; end if;
  if _id is null then
    insert into prime_plans (name, months, price, description, benefits, is_active, sort_order)
    values (btrim(_name), _months, _price, nullif(btrim(_description), ''), coalesce(_benefits, '{}'), coalesce(_active, true), (select coalesce(max(sort_order), 0) + 1 from prime_plans));
  else
    update prime_plans set name = btrim(_name), months = _months, price = _price, description = nullif(btrim(_description), ''),
      benefits = coalesce(_benefits, '{}'), is_active = coalesce(_active, is_active) where id = _id;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_category(_id uuid, _name text, _description text, _image text, _sort integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; sl text;
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_category');
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de la catégorie.'; end if;
  if _id is null then
    sl := public.seller_subcategory_slug(_name);
    if exists (select 1 from categories where slug = sl) then raise exception 'Une catégorie porte déjà ce nom.'; end if;
    insert into categories (slug, name, description, image_url, sort_order)
    values (sl, btrim(_name), nullif(btrim(_description), ''), nullif(_image, ''), coalesce(_sort, (select coalesce(max(sort_order), 0) + 1 from categories)))
    returning id into rid;
  else
    update categories set name = btrim(_name), description = nullif(btrim(_description), ''), image_url = nullif(_image, ''),
      sort_order = coalesce(_sort, sort_order) where id = _id returning id into rid;
  end if;
  return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_subcategory(_id uuid, _category uuid, _name text, _description text, _image text, _active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; sl text;
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_subcategory');
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le titre de la sous-catégorie.'; end if;
  if _category is null or not exists (select 1 from categories where id = _category) then raise exception 'Choisissez la catégorie parente.'; end if;
  if _id is null then
    sl := nullif(trim(both '-' from regexp_replace(lower(translate(btrim(_name), 'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '-', 'g')), '');
    if exists (select 1 from subcategories where slug = sl or lower(name) = lower(btrim(_name))) then raise exception 'Une sous-catégorie porte déjà ce nom.'; end if;
    insert into subcategories (category_id, slug, name, description, image_url, is_active, sort_order)
    values (_category, sl, btrim(_name), nullif(btrim(_description), ''), nullif(_image, ''), coalesce(_active, true),
            (select coalesce(max(sort_order), 0) + 1 from subcategories where category_id = _category))
    returning id into rid;
  else
    -- le titre peut changer ; l'adresse (slug) reste la même pour ne pas casser les produits déjà classés
    update subcategories set category_id = _category, name = btrim(_name), description = nullif(btrim(_description), ''),
      image_url = nullif(_image, ''), is_active = coalesce(_active, is_active) where id = _id returning id into rid;
    update products p set category_slug = c.slug from subcategories s join categories c on c.id = s.category_id
      where s.id = _id and p.subcategory_slug = s.slug and p.category_slug <> c.slug;
  end if;
  return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_attribute(_id uuid, _name text, _kind text, _values text[], _active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare vals text[];
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_attribute');
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de l''attribut.'; end if;
  if _kind not in ('text', 'color', 'size') then raise exception 'Type d''attribut invalide.'; end if;
  select coalesce(array_agg(v order by o), '{}') into vals from (
    select distinct on (lower(btrim(v))) btrim(v) v, o from unnest(coalesce(_values, '{}')) with ordinality u(v, o)
    where btrim(v) <> '' order by lower(btrim(v)), o) x;
  if _id is null then
    insert into product_attributes (name, kind, values, is_active, sort_order)
    values (btrim(_name), _kind, vals, coalesce(_active, true), (select coalesce(max(sort_order), 0) + 1 from product_attributes));
  else
    update product_attributes set name = btrim(_name), kind = _kind, values = vals, is_active = coalesce(_active, is_active) where id = _id;
  end if;
exception when unique_violation then raise exception 'Cet attribut existe déjà.';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_carrier(_c jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_c->>'id', '')::uuid;
begin
  if nullif(_c->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_carrier');
  if coalesce(btrim(_c->>'name'), '') = '' then raise exception 'Indiquez le nom du transporteur.'; end if;
  if rid is null then
    insert into carriers (name, logo_url, contact_name, phone, email, city, address, cities, price_note, notes, is_active)
    values (btrim(_c->>'name'), nullif(_c->>'logo_url', ''), nullif(_c->>'contact_name', ''), nullif(_c->>'phone', ''), nullif(_c->>'email', ''),
      nullif(_c->>'city', ''), nullif(_c->>'address', ''), coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'cities') v), '{}'),
      nullif(_c->>'price_note', ''), nullif(_c->>'notes', ''), coalesce((_c->>'is_active')::boolean, true)) returning id into rid;
  else
    update carriers set name = btrim(_c->>'name'), logo_url = nullif(_c->>'logo_url', ''), contact_name = nullif(_c->>'contact_name', ''),
      phone = nullif(_c->>'phone', ''), email = nullif(_c->>'email', ''), city = nullif(_c->>'city', ''), address = nullif(_c->>'address', ''),
      cities = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'cities') v), '{}'), price_note = nullif(_c->>'price_note', ''),
      notes = nullif(_c->>'notes', ''), is_active = coalesce((_c->>'is_active')::boolean, is_active) where id = rid;
  end if;
  return rid;
exception when unique_violation then raise exception 'Ce transporteur existe déjà.';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_courier(_c jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_c->>'id', '')::uuid;
begin
  if nullif(_c->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_courier');
  if coalesce(btrim(_c->>'full_name'), '') = '' then raise exception 'Indiquez le nom du livreur.'; end if;
  if coalesce(btrim(_c->>'phone'), '') = '' then raise exception 'Indiquez le téléphone du livreur.'; end if;
  if rid is null then insert into couriers (full_name, phone) values (btrim(_c->>'full_name'), btrim(_c->>'phone')) returning id into rid; end if;
  update couriers set
    carrier_id = nullif(_c->>'carrier_id', '')::uuid, full_name = btrim(_c->>'full_name'), phone = btrim(_c->>'phone'),
    email = nullif(_c->>'email', ''), photo_url = nullif(_c->>'photo_url', ''), id_number = nullif(_c->>'id_number', ''),
    city = nullif(_c->>'city', ''), districts = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'districts') v), '{}'),
    vehicle_type = coalesce(nullif(_c->>'vehicle_type', ''), 'moto'), vehicle_brand = nullif(_c->>'vehicle_brand', ''),
    vehicle_plate = nullif(upper(_c->>'vehicle_plate'), ''), vehicle_color = nullif(_c->>'vehicle_color', ''),
    insurance_until = nullif(_c->>'insurance_until', '')::date, pay_per_delivery = coalesce(nullif(_c->>'pay_per_delivery', '')::int, 1000),
    work_days = coalesce((select array_agg(v) from jsonb_array_elements_text(_c->'work_days') v), work_days),
    work_start = coalesce(nullif(_c->>'work_start', '')::time, work_start), work_end = coalesce(nullif(_c->>'work_end', '')::time, work_end),
    status = coalesce(nullif(_c->>'status', ''), status), availability = coalesce(nullif(_c->>'availability', ''), availability),
    notes = nullif(_c->>'notes', '')
  where id = rid;
  return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_zone(_id uuid, _city text, _fee integer, _free integer, _days integer, _active boolean, _districts text[] DEFAULT '{}'::text[], _carrier uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_zone');
  if coalesce(btrim(_city), '') = '' then raise exception 'Choisissez la ville.'; end if;
  if _fee is null or _fee < 0 then raise exception 'Frais invalides.'; end if;
  if _id is null then
    insert into delivery_zones (city, fee, free_threshold, days, is_active, districts, carrier_id)
    values (btrim(_city), _fee, _free, _days, coalesce(_active, true), coalesce(_districts, '{}'), _carrier);
  else
    update delivery_zones set city = btrim(_city), fee = _fee, free_threshold = _free, days = _days, is_active = coalesce(_active, true),
      districts = coalesce(_districts, districts), carrier_id = _carrier where id = _id;
  end if;
exception when unique_violation then raise exception 'Cette ville a déjà un tarif.';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_banner(_b jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_b->>'id', '')::uuid;
begin
  if nullif(_b->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_banner');
  if coalesce(_b->>'image_url', '') = '' then raise exception 'Ajoutez l''image de la bannière.'; end if;
  if nullif(_b->>'link_url', '') is not null and (_b->>'link_url') !~ '^(https?://|/)' then raise exception 'Le lien doit commencer par https:// ou par / (page du site).'; end if;
  if rid is null then
    if (select count(*) from home_banners) >= 6 then raise exception 'Maximum 6 bannières : supprimez-en une avant d''en ajouter une nouvelle.'; end if;
    insert into home_banners (image_url, mobile_image_url, link_url, title, is_active, starts_at, ends_at, sort_order)
    values (_b->>'image_url', nullif(_b->>'mobile_image_url', ''), nullif(btrim(_b->>'link_url'), ''), nullif(btrim(_b->>'title'), ''),
      coalesce((_b->>'is_active')::boolean, true), nullif(_b->>'starts_at', '')::timestamptz, nullif(_b->>'ends_at', '')::timestamptz,
      (select coalesce(max(sort_order), 0) + 1 from home_banners));
  else
    update home_banners set image_url = _b->>'image_url', mobile_image_url = nullif(_b->>'mobile_image_url', ''), link_url = nullif(btrim(_b->>'link_url'), ''),
      title = nullif(btrim(_b->>'title'), ''), is_active = coalesce((_b->>'is_active')::boolean, is_active),
      starts_at = nullif(_b->>'starts_at', '')::timestamptz, ends_at = nullif(_b->>'ends_at', '')::timestamptz where id = rid;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_message(_m jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid; mid uuid := nullif(_m->>'id', '')::uuid; aud text := coalesce(nullif(_m->>'audience', ''), 'all');
begin
  if nullif(_m->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_message');
  if mid is not null and not (_m ? 'title') then
    update customer_messages set is_active = coalesce((_m->>'is_active')::boolean, is_active) where id = mid; return;
  end if;
  if coalesce(btrim(_m->>'title'), '') = '' or coalesce(btrim(_m->>'body'), '') = '' then raise exception 'Indiquez le titre et le message.'; end if;
  if aud not in ('all', 'prime', 'buyers', 'user', 'visitors', 'new_visitors') then raise exception 'Destinataires invalides.'; end if;
  if aud = 'user' then
    select id into uid from auth.users where lower(email) = lower(btrim(_m->>'email'));
    if uid is null then raise exception 'Aucun compte client avec cet e-mail.'; end if;
  end if;
  if mid is not null then
    update customer_messages set title = btrim(_m->>'title'), body = btrim(_m->>'body'), image_url = nullif(_m->>'image_url', ''),
      link_url = nullif(btrim(_m->>'link_url'), ''), link_label = nullif(btrim(_m->>'link_label'), ''), audience = aud, user_id = uid,
      ends_at = nullif(_m->>'ends_at', '')::timestamptz where id = mid;
    return;
  end if;
  insert into customer_messages (title, body, image_url, link_url, link_label, audience, user_id, starts_at, ends_at)
  values (btrim(_m->>'title'), btrim(_m->>'body'), nullif(_m->>'image_url', ''), nullif(btrim(_m->>'link_url'), ''), nullif(btrim(_m->>'link_label'), ''),
    aud, uid, coalesce(nullif(_m->>'starts_at', '')::timestamptz, now()), nullif(_m->>'ends_at', '')::timestamptz);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_coupon(_c jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s sellers; _code text := upper(regexp_replace(coalesce(_c->>'code', ''), '\s', '', 'g')); mkt boolean := coalesce(_c->>'scope', '') = 'marketplace';
begin
  if nullif(_c->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_coupon');
  if nullif(_c->>'id', '') is not null then
    update seller_coupons set is_active = coalesce((_c->>'is_active')::boolean, is_active), updated_at = now() where id = (_c->>'id')::uuid; return;
  end if;
  if not mkt then
    select * into s from sellers where id = nullif(_c->>'seller_id', '')::uuid;
    if s.id is null then raise exception 'Choisissez la boutique concernée, ou « Toute la marketplace ».'; end if;
    if nullif(_c->>'product_id', '') is not null and not exists (select 1 from products where id = (_c->>'product_id')::uuid and seller_id = s.id) then
      raise exception 'Ce produit n''appartient pas à cette boutique.';
    end if;
  end if;
  if _code !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'Code invalide : 3 à 20 lettres ou chiffres.'; end if;
  if exists (select 1 from seller_coupons sc where upper(sc.code) = _code) then raise exception 'Ce code existe déjà.'; end if;
  if coalesce(nullif(_c->>'value', '')::int, 0) <= 0 then raise exception 'Indiquez la valeur de la réduction.'; end if;
  if coalesce(_c->>'kind', 'percent') = 'percent' and (_c->>'value')::int > 90 then raise exception 'La réduction ne peut pas dépasser 90 %%.'; end if;
  insert into seller_coupons (owner_id, seller_id, code, kind, value, product_id, min_order_fcfa, max_uses, starts_at, ends_at, is_active, created_by_admin)
  values (case when mkt then auth.uid() else coalesce(s.owner_id, auth.uid()) end, case when mkt then null else s.id end, _code, coalesce(nullif(_c->>'kind', ''), 'percent'),
    (_c->>'value')::int, case when mkt then null else nullif(_c->>'product_id', '')::uuid end,
    coalesce(nullif(_c->>'min_order', '')::int, 0), nullif(_c->>'max_uses', '')::int,
    coalesce(nullif(_c->>'starts_at', '')::timestamptz, now()), nullif(_c->>'ends_at', '')::timestamptz, true, true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_brand(_id uuid, _name text, _logo text, _active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if _id is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_brand');
  if coalesce(btrim(_name), '') = '' then raise exception 'Indiquez le nom de la marque.'; end if;
  if _id is null then insert into brands (name, logo_url, is_active) values (btrim(_name), nullif(_logo, ''), coalesce(_active, true));
  else update brands set name = btrim(_name), logo_url = nullif(_logo, ''), is_active = coalesce(_active, is_active) where id = _id; end if;
exception when unique_violation then raise exception 'Cette marque existe déjà.';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_incident(_i jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_i->>'id', '')::uuid;
begin
  if nullif(_i->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_incident');
  if rid is null then
    insert into courier_incidents (courier_id, order_id, kind, severity, description)
    values (nullif(_i->>'courier_id', '')::uuid, (select id from orders where order_number = upper(btrim(_i->>'order_number'))),
      coalesce(nullif(_i->>'kind', ''), 'autre'), coalesce(nullif(_i->>'severity', ''), 'moyenne'), nullif(btrim(_i->>'description'), ''));
  else
    update courier_incidents set status = coalesce(nullif(_i->>'status', ''), status), resolution = coalesce(nullif(btrim(_i->>'resolution'), ''), resolution),
      resolved_at = case when _i->>'status' = 'resolved' then now() when _i->>'status' = 'open' then null else resolved_at end where id = rid;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_campaign(_c jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record;
begin
  if nullif(_c->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_campaign');
  if nullif(_c->>'id', '') is not null then
    update seller_campaigns set status = coalesce(nullif(_c->>'status', ''), status) where id = (_c->>'id')::uuid; return;
  end if;
  select pr.id, s.id sid, s.owner_id into p from products pr join sellers s on s.id = pr.seller_id where pr.id = (_c->>'product_id')::uuid;
  if p.id is null then raise exception 'Choisissez le produit à mettre en avant.'; end if;
  if coalesce(btrim(_c->>'name'), '') = '' then raise exception 'Donnez un nom à la campagne.'; end if;
  insert into seller_campaigns (owner_id, seller_id, product_id, name, placement, daily_budget, starts_at, ends_at, status)
  values (p.owner_id, p.sid, p.id, btrim(_c->>'name'), coalesce(nullif(_c->>'placement', ''), 'all'), nullif(_c->>'daily_budget', '')::int,
    coalesce(nullif(_c->>'starts_at', '')::timestamptz, now()), nullif(_c->>'ends_at', '')::timestamptz, 'active');
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_flash(_f jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; ids uuid[]; n int := 0;
begin
  if nullif(_f->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_flash');
  if nullif(_f->>'id', '') is not null then
    update seller_flash_sales set is_active = coalesce((_f->>'is_active')::boolean, is_active) where id = (_f->>'id')::uuid; return 1;
  end if;
  ids := coalesce(array(select jsonb_array_elements_text(coalesce(_f->'product_ids', '[]'::jsonb))::uuid), '{}');
  if nullif(_f->>'product_id', '') is not null then ids := ids || (_f->>'product_id')::uuid; end if;
  if cardinality(ids) = 0 then raise exception 'Choisissez au moins un produit.'; end if;
  if coalesce(nullif(_f->>'value', '')::int, 0) <= 0 then raise exception 'Indiquez la réduction.'; end if;
  if nullif(_f->>'ends_at', '') is null then raise exception 'Indiquez la date de fin.'; end if;
  for p in select pr.id, s.id sid, s.owner_id from products pr join sellers s on s.id = pr.seller_id where pr.id = any(ids) loop
    insert into seller_flash_sales (owner_id, seller_id, product_id, kind, value, starts_at, ends_at, is_active)
    values (coalesce(p.owner_id, auth.uid()), p.sid, p.id, coalesce(nullif(_f->>'kind', ''), 'percent'), (_f->>'value')::int,
      coalesce(nullif(_f->>'starts_at', '')::timestamptz, now()), (_f->>'ends_at')::timestamptz, true);
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_job_offer(_o jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _id uuid := nullif(_o->>'id', '')::uuid; _st text := coalesce(nullif(_o->>'status', ''), 'draft');
begin
  if nullif(_o->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform admin_guard('admin_save_job_offer');
  if _st not in ('draft','published','closed') then raise exception 'Statut invalide.'; end if;
  if char_length(btrim(coalesce(_o->>'title', ''))) < 3 then raise exception 'Indiquez l''intitulé du poste.'; end if;
  if _st = 'published' and char_length(btrim(coalesce(_o->>'summary', ''))) < 20 then raise exception 'Ajoutez une présentation du poste (20 caractères minimum) avant de publier.'; end if;
  if _id is null then
    insert into job_offers (title, created_by) values (btrim(_o->>'title'), auth.uid()) returning id into _id;
  end if;
  update job_offers set
    title = btrim(_o->>'title'), department = nullif(btrim(coalesce(_o->>'department', '')), ''),
    contract_type = coalesce(nullif(_o->>'contract_type', ''), 'CDI'), city = nullif(btrim(coalesce(_o->>'city', '')), ''),
    work_mode = coalesce(nullif(_o->>'work_mode', ''), 'Sur site'), positions = greatest(1, coalesce((_o->>'positions')::int, 1)),
    salary = nullif(btrim(coalesce(_o->>'salary', '')), ''), image_url = nullif(_o->>'image_url', ''),
    summary = nullif(btrim(coalesce(_o->>'summary', '')), ''), missions = nullif(btrim(coalesce(_o->>'missions', '')), ''),
    requirements = nullif(btrim(coalesce(_o->>'requirements', '')), ''), benefits = nullif(btrim(coalesce(_o->>'benefits', '')), ''),
    deadline = nullif(_o->>'deadline', '')::date, status = _st,
    published_at = case when _st = 'published' then coalesce(published_at, now()) else published_at end,
    updated_at = now()
  where id = _id;
  return _id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_agency(_a jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid := nullif(_a->>'id', '')::uuid; regs text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'regions', '[]'))), '{}');
  cts text[] := coalesce(array(select jsonb_array_elements_text(coalesce(_a->'cities', '[]'))), '{}');
  cf jsonb := '{}'::jsonb; e record;
begin
  if nullif(_a->>'id', '') is null then perform public.admin_super_only('ajouter'); end if;  -- création : super administrateur uniquement
  perform public.admin_guard('admin_save_agency');
  if coalesce(btrim(_a->>'name'), '') = '' then raise exception 'Indiquez le nom de l''agence.'; end if;
  if cardinality(regs) = 0 then raise exception 'Choisissez au moins une région desservie.'; end if;
  if coalesce((_a->>'fee')::int, -1) < 0 then raise exception 'Indiquez le tarif général d''expédition.'; end if;
  if coalesce(btrim(_a->>'depot_district'), '') = '' then raise exception 'Indiquez le quartier où se trouve l''agence (ex. Mvan).'; end if;
  -- tarifs par ville : uniquement des villes desservies, montants positifs
  for e in select key, value from jsonb_each_text(coalesce(_a->'city_fees', '{}'::jsonb)) loop
    if nullif(btrim(e.value), '') is null then continue; end if;
    if e.value !~ '^\d+$' then raise exception 'Tarif invalide pour %.', e.key; end if;
    cf := cf || jsonb_build_object(btrim(e.key), e.value::int);
  end loop;
  if rid is null then
    insert into shipping_agencies (name, phone, address, regions, cities, fee, city_fees, depot_city, depot_district, delay_text, notes, is_active)
    values (btrim(_a->>'name'), nullif(btrim(_a->>'phone'), ''), nullif(btrim(_a->>'address'), ''), regs, cts, (_a->>'fee')::int, cf,
      coalesce(nullif(btrim(_a->>'depot_city'), ''), 'Yaoundé'), btrim(_a->>'depot_district'),
      nullif(btrim(_a->>'delay_text'), ''), nullif(btrim(_a->>'notes'), ''), coalesce((_a->>'is_active')::boolean, true)) returning id into rid;
  else
    update shipping_agencies set name = btrim(_a->>'name'), phone = nullif(btrim(_a->>'phone'), ''), address = nullif(btrim(_a->>'address'), ''),
      regions = regs, cities = cts, fee = (_a->>'fee')::int, city_fees = cf,
      depot_city = coalesce(nullif(btrim(_a->>'depot_city'), ''), 'Yaoundé'), depot_district = btrim(_a->>'depot_district'),
      delay_text = nullif(btrim(_a->>'delay_text'), ''), notes = nullif(btrim(_a->>'notes'), ''),
      is_active = coalesce((_a->>'is_active')::boolean, is_active), updated_at = now() where id = rid;
  end if;
  return rid;
end $function$;

commit;
