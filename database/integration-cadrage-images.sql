-- Cadrage automatique des photos calculé UNE fois côté serveur (fonction « compress-image »),
-- au lieu d'être recalculé dans le téléphone de chaque visiteur.
-- box = zone occupée par le produit dans la photo [x0, y0, x1, y1] (fractions 0..1),
-- ar = largeur/hauteur de la photo, bg = fond : 0 coloré, 1 blanc, 2 transparent.
create table if not exists public.image_framing (
  url text primary key,
  ar real not null,
  box real[] not null check (array_length(box, 1) = 4),
  bg smallint not null check (bg in (0, 1, 2)),
  updated_at timestamptz not null default now()
);
alter table public.image_framing enable row level security;
revoke all on public.image_framing from anon, authenticated;

-- Cadrages des images utilisées sur le site public (produits publiés, variantes, catégories, sous-catégories).
create or replace function public.catalog_framing() returns jsonb language sql stable security definer set search_path = public as $$
  with used as (
    select jsonb_array_elements_text(p.images) u from products p where p.is_published and jsonb_typeof(p.images) = 'array'
    union select jsonb_array_elements_text(g->'images') from products p, jsonb_array_elements(case when jsonb_typeof(p.variant_images) = 'array' then p.variant_images else '[]'::jsonb end) g where p.is_published and jsonb_typeof(g->'images') = 'array'
    union select image_url from subcategories where image_url is not null
    union select image_url from categories where image_url is not null
  )
  select coalesce(jsonb_object_agg(f.url, jsonb_build_array(round(f.ar::numeric, 4), round(f.box[1]::numeric, 4), round(f.box[2]::numeric, 4), round(f.box[3]::numeric, 4), round(f.box[4]::numeric, 4), f.bg)), '{}'::jsonb)
  from image_framing f join used on used.u = f.url;
$$;
grant execute on function public.catalog_framing() to anon, authenticated;

-- Liste des images publiques sans cadrage (rattrapage par la tâche planifiée).
create or replace function public.framing_missing(_limit int) returns setof text language sql stable security definer set search_path = public as $$
  select 'https://oawobzuyjkcnmaorqfmh.supabase.co/storage/v1/object/public/product-images/' || o.name
  from storage.objects o
  where o.bucket_id = 'product-images' and lower(o.name) ~ '\.(jpe?g|png|webp|avif)$'
    and not exists (select 1 from image_framing f where f.url = 'https://oawobzuyjkcnmaorqfmh.supabase.co/storage/v1/object/public/product-images/' || o.name)
  order by o.created_at desc limit greatest(1, least(_limit, 60));
$$;
revoke all on function public.framing_missing(int) from public, anon, authenticated;
grant execute on function public.framing_missing(int) to service_role;

-- Rattrapage : toutes les 15 minutes, cadrage des images qui n'en ont pas encore (ex. envoi pendant une panne).
select cron.unschedule('frame-images') where exists (select 1 from cron.job where jobname = 'frame-images');
select cron.schedule('frame-images', '*/15 * * * *', $$
  select net.http_post(url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/compress-image',
    body := '{"framing": true}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000)
  where exists (select 1 from public.framing_missing(1));
$$);
