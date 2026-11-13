-- =====================================================================
-- Amashia : variantes des produits vendeurs visibles sur le site client
-- Migration ADDITIVE : ajoute une colonne et met à jour la publication
-- automatique. Aucune donnée existante n'est supprimée.
--
--   * products.colors          <- valeurs de l'attribut « Couleur » du vendeur
--                                 + noms des variantes avec images
--   * products.sizes           <- valeurs de l'attribut « Taille » / « Pointure »
--   * products.variant_images  <- variantes avec images [{label,color,images}]
-- =====================================================================
begin;

alter table public.products add column if not exists variant_images jsonb not null default '[]'::jsonb;

-- Valeurs d'un attribut vendeur dont le nom figure dans _names (sans tenir compte de la casse/accents simples)
create or replace function public.seller_attribute_values(_attrs jsonb, _names text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(_attrs) = 'array' then _attrs else '[]'::jsonb end) a,
       jsonb_array_elements_text(case when jsonb_typeof(a->'values') = 'array' then a->'values' else '[]'::jsonb end) v
  where lower(translate(trim(a->>'name'), 'éèêÉÈÊ', 'eeeeee')) = any(_names)
    and trim(v) <> ''
$$;

-- Variantes avec au moins une image : [{label, color, images}]
create or replace function public.seller_variant_groups(_groups jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', trim(g->>'label'),
           'color', nullif(trim(coalesce(g->>'color', '')), ''),
           'images', g->'images')), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(_groups) = 'array' then _groups else '[]'::jsonb end) g
  where coalesce(trim(g->>'label'), '') <> ''
    and jsonb_typeof(g->'images') = 'array'
    and jsonb_array_length(g->'images') > 0
$$;

create or replace function public.seller_product_publish()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  publishable boolean;
  specs_obj jsonb;
  v_groups jsonb;
  v_colors jsonb;
  v_sizes jsonb;
begin
  -- évite la boucle avec la synchronisation de stock inverse
  if pg_trigger_depth() > 1 then return new; end if;

  publishable := new.status = 'active'
    and coalesce(trim(new.name), '') <> ''
    and coalesce(new.price, 0) > 0
    and coalesce(array_length(new.images, 1), 0) > 0;

  if new.marketplace_product_id is null and not publishable then
    return new;
  end if;

  sid := public.ensure_seller_for(new.user_id);

  select coalesce(jsonb_object_agg(s->>'name', coalesce(s->>'value', '')), '{}'::jsonb)
    into specs_obj
  from jsonb_array_elements(case when jsonb_typeof(new.specifications) = 'array' then new.specifications else '[]'::jsonb end) s
  where coalesce(trim(s->>'name'), '') <> '';

  v_groups := public.seller_variant_groups(new.variant_images);
  -- couleurs = attribut « Couleur » + noms des variantes avec images (sans doublon)
  select coalesce(jsonb_agg(distinct c), '[]'::jsonb) into v_colors
  from (
    select jsonb_array_elements_text(public.seller_attribute_values(new.attributes, array['couleur', 'couleurs', 'color', 'colour', 'colors'])) c
    union
    select g->>'label' from jsonb_array_elements(v_groups) g
  ) x;
  v_sizes := public.seller_attribute_values(new.attributes, array['taille', 'tailles', 'pointure', 'pointures', 'size', 'sizes']);

  if new.marketplace_product_id is null then
    insert into public.products (
      seller_id, category_slug, title, description, price_fcfa, original_price_fcfa,
      stock, images, specs, features, colors, sizes, variant_images, is_published
    ) values (
      sid, public.seller_category_slug(new.category), new.name, new.description,
      round(new.price)::int,
      case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      greatest(new.stock, 0), to_jsonb(coalesce(new.images, '{}')), specs_obj, '[]'::jsonb,
      v_colors, v_sizes, v_groups, true
    )
    returning id into new.marketplace_product_id;
    new.published_at := now();
  else
    update public.products set
      seller_id = sid,
      category_slug = public.seller_category_slug(new.category),
      title = case when coalesce(trim(new.name), '') <> '' then new.name else title end,
      description = new.description,
      price_fcfa = case when coalesce(new.price, 0) > 0 then round(new.price)::int else price_fcfa end,
      original_price_fcfa = case when new.compare_at_price > new.price then round(new.compare_at_price)::int end,
      stock = greatest(new.stock, 0),
      images = case when coalesce(array_length(new.images, 1), 0) > 0 then to_jsonb(new.images) else images end,
      specs = specs_obj,
      colors = v_colors,
      sizes = v_sizes,
      variant_images = v_groups,
      is_published = publishable
    where id = new.marketplace_product_id;
    if publishable and new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.seller_product_publish() from public, anon, authenticated;

-- Remet à jour les produits déjà publiés (relance la publication automatique)
update public.seller_products set updated_at = now() where marketplace_product_id is not null;

commit;
