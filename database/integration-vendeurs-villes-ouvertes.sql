-- Création de compte vendeur : uniquement Yaoundé et Douala (refus automatique, vérifié par la base).
-- S'applique aux NOUVEAUX profils vendeurs (insertion) ; les vendeurs existants ne sont pas modifiés.
create or replace function public.seller_open_city_check() returns trigger
language plpgsql as $$
begin
  if lower(translate(btrim(coalesce(new.city, '')), 'éÉ', 'eE')) not in ('yaounde', 'douala') then
    raise exception 'Pour le moment, Amachia accepte uniquement les vendeurs de Yaoundé et de Douala.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists seller_open_city on public.seller_profiles;
create trigger seller_open_city before insert on public.seller_profiles
  for each row execute function public.seller_open_city_check();
