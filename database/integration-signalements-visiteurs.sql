-- Signalements faits par des visiteurs sans compte : ils sont prévenus quand l'admin les résout
-- (identifiant anonyme et aléatoire du navigateur, le même que pour les statistiques de boutique).
alter table public.product_reports add column if not exists reporter_visitor text;
create index if not exists product_reports_visitor_idx on public.product_reports (reporter_visitor) where reporter_visitor is not null;

drop function if exists public.report_product(uuid, text, text, text, text);
create or replace function public.report_product(_product uuid, _reason text, _message text, _name text, _contact text, _visitor text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sp record; owner uuid; v text := nullif(left(btrim(coalesce(_visitor, '')), 64), '');
begin
  if coalesce(trim(_reason), '') = '' then raise exception 'Motif requis'; end if;
  if not exists (select 1 from products where id = _product) then raise exception 'Produit introuvable'; end if;
  if v is not null and v !~ '^[A-Za-z0-9-]{16,64}$' then v := null; end if;
  -- limite : 5 signalements par produit et par personne (compte ou navigateur) et par jour
  if (select count(*) from product_reports where listing_id = _product and created_at > now() - interval '1 day'
        and ((auth.uid() is not null and reporter_id = auth.uid()) or (v is not null and reporter_visitor = v))) >= 5 then
    return;
  end if;
  select id, user_id into sp from seller_products where marketplace_product_id = _product;
  select s.owner_id into owner from products p join sellers s on s.id = p.seller_id where p.id = _product;
  insert into product_reports (product_id, listing_id, seller_id, reporter_id, reporter_visitor, reporter_name, reporter_contact, reason, message)
  values (sp.id, _product, coalesce(sp.user_id, owner), auth.uid(), v, left(nullif(trim(_name), ''), 80), left(nullif(trim(_contact), ''), 120), left(trim(_reason), 120), left(nullif(trim(_message), ''), 1000));
end $$;
grant execute on function public.report_product(uuid, text, text, text, text, text) to anon, authenticated;

-- Signalements résolus d'un visiteur (connecté ou non), pas encore montrés
create or replace function public.visitor_resolved_reports(_visitor text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'product_title', coalesce(p.title, 'ce produit'),
      'product_image', p.images->>0, 'created_at', r.created_at, 'resolved_at', r.resolved_at) order by r.resolved_at), '[]'::jsonb)
  from public.product_reports r left join public.products p on p.id = r.listing_id
  where r.status = 'resolved' and r.reporter_notified_at is null
    and ((auth.uid() is not null and r.reporter_id = auth.uid())
      or (length(coalesce(_visitor, '')) >= 16 and r.reporter_visitor = _visitor))
$$;
create or replace function public.visitor_ack_reports(_visitor text, _ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.product_reports set reporter_notified_at = now()
  where id = any(_ids) and ((auth.uid() is not null and reporter_id = auth.uid())
    or (length(coalesce(_visitor, '')) >= 16 and reporter_visitor = _visitor))
$$;
grant execute on function public.visitor_resolved_reports(text) to anon, authenticated;
grant execute on function public.visitor_ack_reports(text, uuid[]) to anon, authenticated;
