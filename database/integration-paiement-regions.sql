-- 1. Hors Yaoundé / Douala : pas de quartier demandé (expédition par agence)
do $$ declare def text; begin
  def := pg_get_functiondef('public.customer_checkout'::regproc);
  if position('is_local_city(p_details' in def) = 0 then
    def := replace(def, $x$OR coalesce(p_details->>'district','')='' OR$x$, $x$OR (coalesce(p_details->>'district','')='' AND public.is_local_city(p_details->>'city')) OR$x$);
    if position('is_local_city(p_details' in def) = 0 then raise exception 'customer_checkout : emplacement introuvable'; end if;
    execute def;
  end if;
end $$;

-- 2. Reconnaissance au paiement : e-mail et/ou téléphone uniquement ; renvoie le prénom du compte trouvé
create or replace function public.checkout_account_exists(_email text, _phone text, _visitor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(_email, ''))); p text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 9);
  v text := left(coalesce(_visitor, ''), 64); uid uuid; by_ text; fname text;
begin
  if (select count(*) from account_lookups where visitor = v and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('exists', false, 'limited', true);
  end if;
  insert into account_lookups (visitor) values (v);
  delete from account_lookups where at < now() - interval '1 day';
  if e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    select id into uid from auth.users where lower(email) = e limit 1;
    if uid is not null then by_ := 'email'; end if;
  end if;
  if uid is null and length(p) = 9 then
    select id into uid from profiles where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = p limit 1;
    if uid is null then
      select id into uid from auth.users where right(regexp_replace(coalesce(phone, raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 9) = p limit 1;
    end if;
    if uid is not null then by_ := 'phone'; end if;
  end if;
  if uid is null then return jsonb_build_object('exists', false); end if;
  select coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), '')) into fname
    from auth.users u left join profiles pr on pr.id = u.id where u.id = uid;
  -- seul le prénom est renvoyé (jamais le nom de famille, l'e-mail ni le téléphone)
  return jsonb_build_object('exists', true, 'by', by_, 'first_name', nullif(split_part(coalesce(fname, ''), ' ', 1), ''));
end $$;
