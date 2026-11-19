-- Espace admin : avis recueillis auprès des vendeurs (avec leur accord) + création de vendeurs
alter table public.seller_platform_reviews add column if not exists source text not null default 'seller' check (source in ('seller', 'admin'));
alter table public.seller_platform_reviews add column if not exists consent_note text;
alter table public.seller_platform_reviews add column if not exists recorded_by uuid references auth.users(id) on delete set null;

-- un avis saisi par l'équipe doit toujours dire comment l'accord du vendeur a été obtenu
alter table public.seller_platform_reviews drop constraint if exists seller_platform_reviews_consent_chk;
alter table public.seller_platform_reviews add constraint seller_platform_reviews_consent_chk
  check (source = 'seller' or char_length(btrim(coalesce(consent_note, ''))) >= 8);

-- quand le vendeur modifie lui-même son avis, il redevient « écrit par le vendeur »
create or replace function public.seller_platform_reviews_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now(); new.body := btrim(new.body);
  if auth.uid() is not null and auth.uid() = new.seller_id then new.source := 'seller'; new.consent_note := null; new.recorded_by := null; end if;
  return new;
end $$;

-- Liste admin : tous les avis (publiés ou non) avec le vendeur et l'origine
create or replace function public.admin_platform_reviews() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_platform_reviews');
  return jsonb_build_object(
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'seller_id', r.seller_id, 'rating', r.rating, 'body', r.body, 'is_published', r.is_published,
        'source', r.source, 'consent_note', r.consent_note, 'created_at', r.created_at, 'updated_at', r.updated_at,
        'name', trim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')), 'shop', sp.shop_name, 'city', sp.city,
        'logo', sp.shop_logo_url, 'recorded_by', (select u.email from auth.users u where u.id = r.recorded_by))
      order by r.created_at desc) from seller_platform_reviews r join seller_profiles sp on sp.id = r.seller_id), '[]'::jsonb),
    'sellers', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', trim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')),
        'shop', sp.shop_name, 'city', sp.city, 'has_review', exists (select 1 from seller_platform_reviews r where r.seller_id = sp.id))
      order by sp.shop_name nulls last) from seller_profiles sp), '[]'::jsonb));
end $$;

-- Saisir / corriger l'avis d'un vendeur (recueilli par téléphone, sur place…) : accord obligatoire
create or replace function public.admin_save_platform_review(_seller uuid, _rating int, _body text, _consent text, _published boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; cur seller_platform_reviews;
begin
  perform public.admin_guard('admin_save_platform_review');
  if not exists (select 1 from seller_profiles where id = _seller) then raise exception 'Vendeur introuvable.'; end if;
  if _rating not between 1 and 5 then raise exception 'La note doit être comprise entre 1 et 5.'; end if;
  if char_length(btrim(coalesce(_body, ''))) not between 15 and 240 then raise exception 'L''avis doit faire entre 15 et 240 caractères.'; end if;
  if char_length(btrim(coalesce(_consent, ''))) < 8 then raise exception 'Indiquez comment le vendeur a donné son accord (ex. : « avis donné par téléphone le 19/11 »).'; end if;
  select * into cur from seller_platform_reviews where seller_id = _seller;
  if cur.id is not null and cur.source = 'seller' then
    raise exception 'Ce vendeur a écrit lui-même son avis : vous pouvez seulement le publier ou le masquer.';
  end if;
  insert into seller_platform_reviews (seller_id, rating, body, is_published, source, consent_note, recorded_by)
    values (_seller, _rating, btrim(_body), coalesce(_published, true), 'admin', btrim(_consent), auth.uid())
  on conflict (seller_id) do update set rating = excluded.rating, body = excluded.body, is_published = excluded.is_published,
    consent_note = excluded.consent_note, recorded_by = excluded.recorded_by, source = 'admin'
  returning id into rid;
  return rid;
end $$;

create or replace function public.admin_set_platform_review_published(_id uuid, _published boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_set_platform_review_published');
  update seller_platform_reviews set is_published = _published where id = _id;
end $$;

create or replace function public.admin_delete_platform_review(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_delete_platform_review');
  delete from seller_platform_reviews where id = _id;
end $$;

-- droits par section (comme les autres pages « Vendeurs »)
insert into public.admin_fn_sections (fn, sections) values
  ('admin_platform_reviews', array['vendeurs']), ('admin_save_platform_review', array['vendeurs']),
  ('admin_set_platform_review_published', array['vendeurs']), ('admin_delete_platform_review', array['vendeurs']),
  ('admin_create_seller', array['vendeurs'])
on conflict (fn) do update set sections = excluded.sections;

revoke all on function public.admin_platform_reviews() from public, anon;
revoke all on function public.admin_save_platform_review(uuid, int, text, text, boolean) from public, anon;
revoke all on function public.admin_set_platform_review_published(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_platform_review(uuid) from public, anon;
grant execute on function public.admin_platform_reviews() to authenticated;
grant execute on function public.admin_save_platform_review(uuid, int, text, text, boolean) to authenticated;
grant execute on function public.admin_set_platform_review_published(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_platform_review(uuid) to authenticated;
