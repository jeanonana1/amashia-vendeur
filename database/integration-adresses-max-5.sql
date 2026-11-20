-- 5 adresses enregistrées au maximum par client
create or replace function public.addresses_max_5() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.addresses where user_id = new.user_id) >= 5 then
    raise exception 'Vous avez déjà 5 adresses enregistrées : supprimez-en une pour en ajouter une nouvelle.';
  end if;
  return new;
end $$;
drop trigger if exists addresses_max_5 on public.addresses;
create trigger addresses_max_5 before insert on public.addresses for each row execute function public.addresses_max_5();
