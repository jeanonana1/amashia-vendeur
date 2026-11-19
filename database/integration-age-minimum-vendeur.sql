-- Vendeurs : 18 ans minimum (vérifié aussi côté base, en plus du formulaire d'inscription)
create or replace function public.seller_min_age_check() returns trigger language plpgsql as $$
begin
  if new.birth_date is not null
     and (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date)
     and new.birth_date::date > (current_date - interval '18 years')::date then
    raise exception 'Vous devez avoir au moins 18 ans pour ouvrir une boutique sur Amashia.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists seller_min_age on public.seller_profiles;
create trigger seller_min_age before insert or update of birth_date on public.seller_profiles
  for each row execute function public.seller_min_age_check();
