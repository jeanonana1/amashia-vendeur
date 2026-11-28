-- =====================================================================================
-- Inscription vendeur : page « Ma boutique » après la vérification de l'e-mail,
-- nom de boutique unique, statut de vérification protégé, refus visible + renvoi du dossier.
-- =====================================================================================

-- ---------- Nom de boutique : comparaison sans accents, majuscules ni espaces en trop ----------
create or replace function public.shop_name_key(_name text) returns text
language sql immutable as $$
  select regexp_replace(lower(translate(btrim(coalesce(_name, '')), 'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '', 'g')
$$;

-- Le nom est-il libre ? Sinon, propose des noms proches qui sont libres.
create or replace function public.shop_name_check(_name text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare k text := public.shop_name_key(_name); n text := btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g'));
  city text; sugg text[] := '{}'; c text;
begin
  if length(n) < 3 then return jsonb_build_object('available', false, 'reason', 'Le nom doit faire au moins 3 caractères.', 'suggestions', '[]'::jsonb); end if;
  if length(n) > 60 then return jsonb_build_object('available', false, 'reason', 'Le nom doit faire au plus 60 caractères.', 'suggestions', '[]'::jsonb); end if;
  if not exists (select 1 from sellers s where public.shop_name_key(s.name) = k and s.owner_id is distinct from auth.uid()) then
    return jsonb_build_object('available', true, 'name', n, 'suggestions', '[]'::jsonb);
  end if;
  select coalesce(nullif(btrim(sp.city), ''), 'Cameroun') into city from seller_profiles sp where sp.id = auth.uid();
  foreach c in array array[n || ' ' || coalesce(city, 'Cameroun'), n || ' Shop', n || ' Store', n || ' 237', n || ' Officiel', 'La boutique ' || n, n || ' Market'] loop
    if not exists (select 1 from sellers s where public.shop_name_key(s.name) = public.shop_name_key(c) and s.owner_id is distinct from auth.uid()) then
      sugg := sugg || c;
    end if;
    exit when cardinality(sugg) >= 4;
  end loop;
  return jsonb_build_object('available', false, 'reason', 'Ce nom de boutique est déjà utilisé.', 'suggestions', to_jsonb(sugg));
end $$;
grant execute on function public.shop_name_check(text) to anon, authenticated;

-- Enregistrement de la boutique (après la vérification de l'e-mail) : nom unique, ville ouverte, position facultative.
create or replace function public.seller_setup_shop(_name text, _description text, _logo text, _banner text,
  _region text, _city text, _neighborhood text, _lat double precision default null, _lng double precision default null, _landmark text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); chk jsonb; sid uuid;
begin
  if uid is null then raise exception 'Connectez-vous pour créer votre boutique.'; end if;
  if not exists (select 1 from seller_profiles where id = uid) then raise exception 'Profil vendeur introuvable : terminez d''abord l''inscription.'; end if;
  chk := public.shop_name_check(_name);
  if not (chk->>'available')::boolean then raise exception '%', chk->>'reason'; end if;
  if lower(translate(btrim(coalesce(_city, '')), 'éÉ', 'eE')) not in ('yaounde', 'douala') then
    raise exception 'Pour le moment, Amachia accepte uniquement les boutiques de Yaoundé et de Douala.';
  end if;
  if coalesce(btrim(_neighborhood), '') = '' then raise exception 'Indiquez le quartier de la boutique.'; end if;
  update seller_profiles set shop_name = chk->>'name', shop_description = nullif(btrim(coalesce(_description, '')), ''),
    shop_logo_url = nullif(btrim(coalesce(_logo, '')), ''), shop_banner_url = nullif(btrim(coalesce(_banner, '')), ''),
    region = nullif(btrim(coalesce(_region, '')), ''), neighborhood = btrim(_neighborhood)
  where id = uid;
  sid := public.ensure_seller_for(uid);
  update sellers set city = btrim(_city) where id = sid;
  if _lat is not null and _lng is not null then
    perform public.seller_set_pickup(_lat, _lng, nullif(btrim(coalesce(_landmark, '')), ''));
  end if;
  return jsonb_build_object('seller_id', sid, 'name', chk->>'name');
end $$;
grant execute on function public.seller_setup_shop(text, text, text, text, text, text, text, double precision, double precision, text) to authenticated;

-- ---------- Statut de vérification protégé : seul l'admin (ou le renvoi du dossier) peut le changer ----------
create or replace function public.sellers_kyc_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if (new.kyc_status is distinct from old.kyc_status or new.kyc_note is distinct from old.kyc_note or new.kyc_reviewed_at is distinct from old.kyc_reviewed_at)
     and coalesce(current_setting('amachia.kyc_ok', true), '') <> '1'
     and not public.has_role(auth.uid(), 'admin'::app_role)
     and auth.uid() is not null then
    raise exception 'Le statut de vérification de la boutique ne peut être modifié que par Amachia.';
  end if;
  return new;
end $$;
drop trigger if exists sellers_kyc_guard on public.sellers;
create trigger sellers_kyc_guard before update on public.sellers for each row execute function public.sellers_kyc_guard();

-- l'admin peut toujours décider (avec motif obligatoire en cas de refus)
create or replace function public.admin_set_kyc(_seller uuid, _status text, _note text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.admin_guard('admin_set_kyc');
  if _status not in ('pending','approved','rejected') then raise exception 'Statut invalide'; end if;
  if _status = 'rejected' and coalesce(btrim(_note), '') = '' then raise exception 'Indiquez la raison du refus.'; end if;
  perform set_config('amachia.kyc_ok', '1', true);
  update public.sellers set kyc_status = _status, kyc_note = nullif(btrim(_note), ''), kyc_reviewed_at = now() where id = _seller;
  if not found then raise exception 'Vendeur introuvable'; end if;
end $$;

-- ---------- Côté vendeur : état de la vérification et renvoi du dossier corrigé ----------
create or replace function public.seller_kyc() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('seller_id', s.id, 'status', s.kyc_status, 'note', s.kyc_note, 'reviewed_at', s.kyc_reviewed_at)
  from sellers s where s.owner_id = auth.uid()
$$;
grant execute on function public.seller_kyc() to authenticated;

create or replace function public.seller_kyc_resubmit() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  perform set_config('amachia.kyc_ok', '1', true);
  update sellers set kyc_status = 'pending', kyc_note = null, kyc_reviewed_at = null where owner_id = auth.uid() and kyc_status = 'rejected';
  if not found then raise exception 'Aucun dossier refusé à renvoyer.'; end if;
end $$;
grant execute on function public.seller_kyc_resubmit() to authenticated;

-- mise à jour en temps réel de la fenêtre de refus (le vendeur ne reçoit que sa propre boutique, selon les règles d'accès)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sellers') then
    alter publication supabase_realtime add table public.sellers;
  end if;
end $$;
