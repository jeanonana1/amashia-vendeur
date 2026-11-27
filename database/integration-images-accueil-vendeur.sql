-- Photos de la page d'accueil du site vendeur, choisies depuis l'admin (Avis vendeurs › Images de l'accueil).
-- Un emplacement vide n'affiche rien : la page reste telle quelle tant qu'aucune photo n'est ajoutée.
--   hero : en-tête · etape1..etape4 : « Comment ça marche » · prime : carte Livraison Prime
--   avis : section avis (si aucune vidéo) · cta : dernier appel à l'action
create or replace function public.seller_home_images() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from site_settings where key = 'seller_home_images'), '{}'::jsonb);
$$;
grant execute on function public.seller_home_images() to anon, authenticated;

create or replace function public.admin_save_seller_home_image(_slot text, _url text, _alt text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb;
begin
  perform admin_guard('admin_save_seller_home_image');
  if _slot not in ('hero', 'etape1', 'etape2', 'etape3', 'etape4', 'prime', 'avis', 'cta') then raise exception 'Emplacement inconnu.'; end if;
  if coalesce(_url, '') <> '' and _url !~ '^https://' then raise exception 'Adresse d''image invalide.'; end if;
  cur := coalesce((select value from site_settings where key = 'seller_home_images'), '{}'::jsonb);
  cur := case when coalesce(_url, '') = '' then cur - _slot
              else cur || jsonb_build_object(_slot, jsonb_build_object('url', _url, 'alt', left(coalesce(nullif(trim(_alt), ''), ''), 200), 'updated_at', now())) end;
  insert into site_settings (key, value, updated_at, updated_by) values ('seller_home_images', cur, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return cur;
end $$;
revoke all on function public.admin_save_seller_home_image(text, text, text) from public, anon;
grant execute on function public.admin_save_seller_home_image(text, text, text) to authenticated;
insert into admin_fn_sections (fn, sections) values ('admin_save_seller_home_image', '{vendeurs}') on conflict (fn) do update set sections = excluded.sections;
