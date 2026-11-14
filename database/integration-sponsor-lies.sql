-- Sous-catégorie précise du produit (catégorie choisie par le vendeur, ex. « Téléphones & Tablettes »)
create or replace function public.seller_subcategory_slug(_category text)
returns text language sql immutable set search_path = public as $$
  select nullif(trim(both '-' from regexp_replace(
    lower(translate(coalesce(_category, ''), 'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
    '[^a-z0-9]+', '-', 'g')), '')
$$;

create or replace function public.sync_product_subcategory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.marketplace_product_id is not null then
    update products set subcategory_slug = public.seller_subcategory_slug(new.category)
    where id = new.marketplace_product_id and subcategory_slug is distinct from public.seller_subcategory_slug(new.category);
  end if;
  return null;
end $$;
drop trigger if exists seller_products_subcategory on seller_products;
create trigger seller_products_subcategory after insert or update of category, marketplace_product_id on seller_products
  for each row execute function public.sync_product_subcategory();

update products p set subcategory_slug = public.seller_subcategory_slug(sp.category)
from seller_products sp where sp.marketplace_product_id = p.id and sp.category is not null;

-- Emplacement « pages produit » pour les campagnes
alter table seller_campaigns drop constraint if exists seller_campaigns_placement_check;
alter table seller_campaigns add constraint seller_campaigns_placement_check check (placement in ('all', 'home', 'search', 'product'));

-- Produits sponsorisés liés à un produit : même sous-catégorie (sinon même catégorie), campagnes actives uniquement
create or replace function public.sponsored_related(_product uuid, _limit int default 12)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select id, category_slug, subcategory_slug from products where id = _product)
  select coalesce(jsonb_agg(jsonb_build_object('campaign_id', x.campaign_id, 'product_id', x.product_id)), '[]'::jsonb)
  from (
    select distinct on (c.product_id) c.id as campaign_id, c.product_id
    from me
    join products p on p.id <> me.id and p.is_published and p.stock > 0
      and case when me.subcategory_slug is not null and p.subcategory_slug is not null
               then p.subcategory_slug = me.subcategory_slug
               else p.category_slug = me.category_slug end
    join seller_campaigns c on c.product_id = p.id and c.status = 'active'
      and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
      and c.placement in ('all', 'product')
    join sellers s on s.id = c.seller_id and s.is_active
    order by c.product_id, c.created_at desc
    limit greatest(1, least(coalesce(_limit, 12), 24))
  ) x;
$$;
grant execute on function public.sponsored_related(uuid, int) to anon, authenticated;
