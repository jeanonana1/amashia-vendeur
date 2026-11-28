-- Candidature renvoyée : les nouveaux documents REMPLACENT les anciens du même type (rien n'est supprimé).
alter table public.seller_documents add column if not exists replaced_at timestamptz;

-- dès qu'un document est ajouté, l'ancien document du même type (même vendeur) est marqué « remplacé »
create or replace function public.seller_documents_replace_old() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update seller_documents set replaced_at = now()
   where user_id = new.user_id and doc_type = new.doc_type and id <> new.id and replaced_at is null;
  return new;
end $$;
drop trigger if exists seller_documents_replace_old on public.seller_documents;
create trigger seller_documents_replace_old after insert on public.seller_documents
  for each row execute function public.seller_documents_replace_old();

-- doublons existants : seul le plus récent de chaque type reste affiché
update public.seller_documents d set replaced_at = now()
 where d.replaced_at is null and exists (
   select 1 from public.seller_documents n
    where n.user_id = d.user_id and n.doc_type = d.doc_type and n.replaced_at is null
      and (n.created_at > d.created_at or (n.created_at = d.created_at and n.id > d.id)));

-- admin : uniquement les documents en vigueur
create or replace function public.admin_kyc() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public.admin_guard('admin_kyc');
  return coalesce((select jsonb_agg(x order by x->>'status' desc, x->>'created_at' desc) from (
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'city', s.city, 'created_at', s.created_at,
      'status', s.kyc_status, 'note', s.kyc_note, 'reviewed_at', s.kyc_reviewed_at, 'is_active', s.is_active,
      'owner', trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')),
      'account_type', sp.account_type, 'niu', sp.niu, 'phone', sp.phone, 'email', u.email,
      'region', sp.region, 'address', sp.shop_address,
      'docs', coalesce((select jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.file_url, 'at', d.created_at) order by d.created_at)
                        from public.seller_documents d where d.user_id = s.owner_id and d.replaced_at is null), '[]'::jsonb)) x
    from public.sellers s
    left join public.seller_profiles sp on sp.id = s.owner_id
    left join auth.users u on u.id = s.owner_id) t), '[]'::jsonb);
end $function$;
