-- Correctif : « invalid input syntax for type json » à la demande de retrait.
-- Le moyen de retrait est un objet JSON ; la notification le traitait comme du texte.
create or replace function public.notif_payout()
returns trigger language plpgsql security definer set search_path = public as $$
declare via text := coalesce(nullif(new.method->>'label', ''),
  case new.method->>'kind' when 'orange_money' then 'Orange Money' when 'mtn_momo' then 'MTN Mobile Money' when 'momo' then 'MTN Mobile Money' when 'bank' then 'virement bancaire' end,
  'votre moyen de retrait');
begin
  if tg_op = 'INSERT' then
    perform public.notify_seller(new.user_id, 'payout', 'Demande de retrait enregistrée', public.fmt_fcfa(new.amount) || ' via ' || via, '/dashboard/paiements');
  elsif new.status is distinct from old.status then
    perform public.notify_seller(new.user_id, 'payout',
      case new.status when 'paid' then 'Retrait effectué' when 'rejected' then 'Retrait refusé' else 'Retrait mis à jour' end,
      public.fmt_fcfa(new.amount) || coalesce(' — ' || new.note, ''), '/dashboard/paiements');
  end if;
  return new;
end $$;
