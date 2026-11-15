-- Nombre de candidatures par offre publiée, affiché publiquement sur la page Carrières (aucune donnée personnelle).
create or replace function public.job_offer_applicant_counts() returns table (offer_id uuid, applicants int)
language sql stable security definer set search_path = public as $$
  select o.id, (select count(*)::int from job_applications a where a.offer_id = o.id)
  from job_offers o where o.status = 'published' and (o.deadline is null or o.deadline >= current_date);
$$;
revoke all on function public.job_offer_applicant_counts() from public;
grant execute on function public.job_offer_applicant_counts() to anon, authenticated;
