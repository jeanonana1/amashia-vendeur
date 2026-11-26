-- Compression automatique des images (TinyPNG) : toute image envoyée dans « product-images »
-- (produits, boutiques, catégories, bannières, photos de retour…) par le site client, le site vendeur
-- ou l'admin est mise en file puis compressée en arrière-plan par la fonction « compress-image ».
create table if not exists public.image_compression_jobs (
  id bigserial primary key,
  bucket text not null,
  name text not null,
  status text not null default 'pending' check (status in ('pending','processing','done','skipped','failed')),
  attempts int not null default 0,
  size_before bigint,
  size_after bigint,
  cache_control text,
  compression_count int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, name)
);
create index if not exists image_compression_jobs_pending on public.image_compression_jobs (status, updated_at) where status in ('pending','processing','failed');
alter table public.image_compression_jobs enable row level security; -- aucun accès direct : service uniquement
revoke all on public.image_compression_jobs from anon, authenticated;

-- Réserve des images à compresser (en attente, échec à retenter, ou bloquées en cours depuis 5 min).
create or replace function public.image_compression_claim(_ids bigint[], _limit int)
returns table (id bigint, bucket text, name text) language sql security definer set search_path = public as $$
  update image_compression_jobs j set status = 'processing', attempts = j.attempts + 1, updated_at = now()
  where j.id in (
    select x.id from image_compression_jobs x
    where (_ids is null or x.id = any(_ids)) and x.attempts < 5
      and (x.status = 'pending'
        or (x.status = 'failed' and x.updated_at < now() - interval '10 minutes')
        or (x.status = 'processing' and x.updated_at < now() - interval '5 minutes'))
    order by x.id limit greatest(1, least(_limit, 25))
    for update skip locked)
  returning j.id, j.bucket, j.name;
$$;
revoke all on function public.image_compression_claim(bigint[], int) from public, anon, authenticated;
grant execute on function public.image_compression_claim(bigint[], int) to service_role;

-- Nouvelle image envoyée → mise en file + appel immédiat de la fonction (asynchrone : l'envoi n'est jamais ralenti).
create or replace function public.storage_image_enqueue() returns trigger language plpgsql security definer set search_path = public as $$
declare _id bigint;
begin
  if new.bucket_id <> 'product-images' or lower(new.name) !~ '\.(jpe?g|png|webp|avif)$' then return new; end if;
  insert into image_compression_jobs (bucket, name, cache_control)
  values (new.bucket_id, new.name, new.metadata->>'cacheControl')
  on conflict (bucket, name) do nothing
  returning id into _id;
  if _id is not null then
    perform net.http_post(
      url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/compress-image',
      body := jsonb_build_object('id', _id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
  end if;
  return new;
exception when others then
  return new; -- la compression ne doit jamais bloquer un envoi d'image
end $$;
drop trigger if exists storage_image_enqueue on storage.objects;
create trigger storage_image_enqueue after insert on storage.objects for each row execute function public.storage_image_enqueue();

-- Filet de sécurité : toutes les 10 minutes, reprise des images restées en attente.
select cron.unschedule('compress-images') where exists (select 1 from cron.job where jobname = 'compress-images');
select cron.schedule('compress-images', '*/10 * * * *', $$
  select net.http_post(url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/compress-image',
    body := '{"sweep": true}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000)
  where exists (select 1 from public.image_compression_jobs where status in ('pending','failed','processing') and attempts < 5);
$$);

-- Bilan pour l'admin (super admin ou section Paramètres).
create or replace function public.admin_image_compression_stats() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_image_compression_stats');
  return (select jsonb_build_object(
    'total', count(*),
    'done', count(*) filter (where status = 'done'),
    'pending', count(*) filter (where status in ('pending','processing')),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'),
    'saved_bytes', coalesce(sum(size_before - size_after) filter (where status = 'done'), 0),
    'before_bytes', coalesce(sum(size_before) filter (where status = 'done'), 0),
    'last_error', (select error from image_compression_jobs where status in ('failed','pending') and error is not null order by updated_at desc limit 1),
    'month_count', (select compression_count from image_compression_jobs where compression_count is not null order by updated_at desc limit 1)
  ) from image_compression_jobs);
end $$;
revoke all on function public.admin_image_compression_stats() from public, anon;
grant execute on function public.admin_image_compression_stats() to authenticated;
insert into admin_fn_sections (fn, sections) values ('admin_image_compression_stats', array['parametres']) on conflict (fn) do update set sections = excluded.sections;
