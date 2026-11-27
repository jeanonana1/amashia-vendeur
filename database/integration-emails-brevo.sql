-- E-mails de commande (Brevo) : chaque événement de commande est mis dans une file, puis envoyé par la
-- fonction « send-emails » (clé BREVO_API_KEY dans les secrets des fonctions Supabase).
--   order_confirmed  : au client, à la commande
--   seller_new_order : à chaque vendeur concerné (sans les coordonnées du client)
--   order_shipped / order_delivered / order_cancelled : au client, au changement d'étape
create table if not exists public.email_outbox (
  id bigserial primary key,
  kind text not null check (kind in ('order_confirmed', 'seller_new_order', 'order_shipped', 'order_delivered', 'order_cancelled')),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
-- un seul e-mail par événement (et par vendeur)
create unique index if not exists email_outbox_once on public.email_outbox (kind, order_id, coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists email_outbox_pending on public.email_outbox (status, updated_at) where status in ('pending', 'processing', 'failed');
alter table public.email_outbox enable row level security; -- aucun accès direct : service uniquement
revoke all on public.email_outbox from anon, authenticated;

-- Appel de la fonction d'envoi (asynchrone : n'allonge jamais la commande).
create or replace function public.email_outbox_kick() returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/send-emails',
    body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
exception when others then null;
end $$;
revoke all on function public.email_outbox_kick() from public, anon, authenticated;

-- Nouvelle commande : confirmation au client (+ e-mails vendeurs, préparés à l'envoi car les articles
-- sont enregistrés juste après la commande).
create or replace function public.trg_email_order_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (kind, order_id) values ('order_confirmed', new.id) on conflict do nothing;
  perform email_outbox_kick();
  return new;
exception when others then
  return new; -- un e-mail ne doit jamais bloquer une commande
end $$;
drop trigger if exists email_order_created on public.orders;
create trigger email_order_created after insert on public.orders for each row execute function public.trg_email_order_created();

-- Changement d'étape : en cours de livraison, livrée, annulée.
create or replace function public.trg_email_order_step() returns trigger language plpgsql security definer set search_path = public as $$
declare _kind text;
begin
  if new.step is not distinct from old.step then return new; end if;
  _kind := case new.step when 'shipped' then 'order_shipped' when 'delivered' then 'order_delivered' when 'cancelled' then 'order_cancelled' end;
  if _kind is null then return new; end if;
  insert into email_outbox (kind, order_id) values (_kind, new.id) on conflict do nothing;
  perform email_outbox_kick();
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists email_order_step on public.orders;
create trigger email_order_step after update on public.orders for each row execute function public.trg_email_order_step();

-- Réserve les e-mails à envoyer (en attente, échec à retenter, bloqués depuis 5 min).
create or replace function public.email_outbox_claim(_limit int) returns setof public.email_outbox
language sql security definer set search_path = public as $$
  update email_outbox o set status = 'processing', attempts = o.attempts + 1, updated_at = now()
  where o.id in (
    select x.id from email_outbox x
    where x.attempts < 5 and (x.status = 'pending'
      or (x.status = 'failed' and x.updated_at < now() - interval '10 minutes')
      or (x.status = 'processing' and x.updated_at < now() - interval '5 minutes'))
    order by x.id limit greatest(1, least(_limit, 30))
    for update skip locked)
  returning o.*;
$$;
revoke all on function public.email_outbox_claim(int) from public, anon, authenticated;
grant execute on function public.email_outbox_claim(int) to service_role;

-- Filet de sécurité : reprise toutes les 10 minutes (clé ajoutée plus tard, coupure…).
select cron.unschedule('send-emails') where exists (select 1 from cron.job where jobname = 'send-emails');
select cron.schedule('send-emails', '*/10 * * * *', $$
  select public.email_outbox_kick() where exists (select 1 from public.email_outbox where status in ('pending', 'failed', 'processing') and attempts < 5);
$$);

-- Bilan pour l'admin (section Paramètres).
create or replace function public.admin_email_stats() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_email_stats');
  return (select jsonb_build_object(
    'sent', count(*) filter (where status = 'sent'),
    'sent_30d', count(*) filter (where status = 'sent' and sent_at > now() - interval '30 days'),
    'pending', count(*) filter (where status in ('pending', 'processing')),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from email_outbox where status = 'sent' group by kind) k),
    'last_error', (select error from email_outbox where status in ('failed', 'pending') and error is not null order by updated_at desc limit 1),
    'last_sent_at', max(sent_at)
  ) from email_outbox);
end $$;
revoke all on function public.admin_email_stats() from public, anon;
grant execute on function public.admin_email_stats() to authenticated;
insert into admin_fn_sections (fn, sections) values ('admin_email_stats', array['parametres']) on conflict (fn) do update set sections = excluded.sections;
