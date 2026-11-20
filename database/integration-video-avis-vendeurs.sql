-- Vidéo de la section « Avis vendeurs » (page d'accueil du site vendeur), choisie depuis l'admin
create or replace function public.seller_home_video() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from site_settings where key = 'seller_reviews_video'), '{}'::jsonb);
$$;
grant execute on function public.seller_home_video() to anon, authenticated;

create or replace function public.admin_save_seller_home_video(_url text, _poster text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform admin_guard('admin_save_seller_home_video');
  if coalesce(_url, '') <> '' and _url !~ '^https://' then raise exception 'Adresse de vidéo invalide.'; end if;
  v := case when coalesce(_url, '') = '' then '{}'::jsonb else jsonb_build_object('url', _url, 'poster', nullif(_poster, ''), 'updated_at', now()) end;
  insert into site_settings (key, value, updated_at, updated_by) values ('seller_reviews_video', v, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;
grant execute on function public.admin_save_seller_home_video(text, text) to authenticated;
insert into admin_fn_sections (fn, sections) values ('admin_save_seller_home_video', '{vendeurs}') on conflict (fn) do update set sections = excluded.sections;
