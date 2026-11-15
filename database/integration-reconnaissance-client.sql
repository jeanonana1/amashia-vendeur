-- Paiement sans être connecté : l'e-mail ou le numéro correspond-il déjà à un compte client ?
-- Ne renvoie qu'un oui / non (aucune donnée du compte). Limité à 20 vérifications par heure et par navigateur.
create table if not exists public.account_lookups (visitor text not null, at timestamptz not null default now());
create index if not exists account_lookups_idx on public.account_lookups (visitor, at desc);
alter table public.account_lookups enable row level security;

create or replace function public.checkout_account_exists(_email text, _phone text, _visitor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(_email, ''))); p text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 9);
  v text := left(coalesce(_visitor, ''), 64); found_email boolean := false; found_phone boolean := false;
begin
  if (select count(*) from account_lookups where visitor = v and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('exists', false, 'limited', true);
  end if;
  insert into account_lookups (visitor) values (v);
  delete from account_lookups where at < now() - interval '1 day';
  if e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    found_email := exists (select 1 from auth.users where lower(email) = e);
  end if;
  if length(p) = 9 then
    found_phone := exists (select 1 from profiles where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = p)
      or exists (select 1 from auth.users where right(regexp_replace(coalesce(phone, raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 9) = p);
  end if;
  return jsonb_build_object('exists', found_email or found_phone, 'by', case when found_email then 'email' when found_phone then 'phone' else null end);
end $$;
revoke all on function public.checkout_account_exists(text, text, text) from public;
grant execute on function public.checkout_account_exists(text, text, text) to anon, authenticated;
