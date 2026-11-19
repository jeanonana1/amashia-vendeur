-- Inscription vendeur : détection d'un compte existant (e-mail ou téléphone)
-- 1) seller_account_hint : dit seulement si un compte existe + prénom et initiale du nom (jamais l'e-mail ni le téléphone)
-- 2) seller_login_email : retrouve l'e-mail de connexion à partir du téléphone, UNIQUEMENT si le mot de passe est correct

create or replace function public.seller_account_hint(_email text default null, _phone text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  uid uuid; m jsonb; d text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 9);
  fn text; ln text; via text;
begin
  if coalesce(trim(_email), '') <> '' then
    select au.id, au.raw_user_meta_data into uid, m from auth.users au
      where lower(au.email) = lower(trim(_email)) and au.deleted_at is null limit 1;
    via := 'email';
  end if;
  if uid is null and length(d) = 9 then
    select au.id, au.raw_user_meta_data into uid, m from public.seller_profiles sp join auth.users au on au.id = sp.id
      where right(regexp_replace(coalesce(sp.phone, ''), '\D', '', 'g'), 9) = d and au.deleted_at is null limit 1;
    if uid is null then
      select au.id, au.raw_user_meta_data into uid, m from auth.users au
        where right(regexp_replace(coalesce(au.raw_user_meta_data->>'phone', au.phone, ''), '\D', '', 'g'), 9) = d and au.deleted_at is null limit 1;
    end if;
    via := 'phone';
  end if;
  if uid is null then return jsonb_build_object('exists', false); end if;
  select coalesce(nullif(sp.first_name, ''), m->>'first_name'), coalesce(nullif(sp.last_name, ''), m->>'last_name')
    into fn, ln from (select 1) x left join public.seller_profiles sp on sp.id = uid;
  return jsonb_build_object(
    'exists', true, 'via', via,
    'name', trim(coalesce(initcap(fn), '') || case when coalesce(ln, '') <> '' then ' ' || upper(left(ln, 1)) || '.' else '' end),
    'is_seller', exists (select 1 from public.seller_profiles where id = uid)
  );
end $$;

create or replace function public.seller_login_email(_phone text, _password text)
returns text language plpgsql security definer set search_path = public, auth, extensions as $$
declare d text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 9); r record;
begin
  if length(d) <> 9 or coalesce(_password, '') = '' then return null; end if;
  for r in
    select au.email, au.encrypted_password from auth.users au
      left join public.seller_profiles sp on sp.id = au.id
      where au.deleted_at is null and (
        right(regexp_replace(coalesce(sp.phone, ''), '\D', '', 'g'), 9) = d
        or right(regexp_replace(coalesce(au.raw_user_meta_data->>'phone', au.phone, ''), '\D', '', 'g'), 9) = d)
  loop
    if r.encrypted_password is not null and extensions.crypt(_password, r.encrypted_password) = r.encrypted_password then
      return r.email;
    end if;
  end loop;
  perform pg_sleep(0.4); -- ralentit les essais au hasard
  return null;
end $$;

revoke all on function public.seller_account_hint(text, text) from public;
revoke all on function public.seller_login_email(text, text) from public;
grant execute on function public.seller_account_hint(text, text) to anon, authenticated;
grant execute on function public.seller_login_email(text, text) to anon, authenticated;
