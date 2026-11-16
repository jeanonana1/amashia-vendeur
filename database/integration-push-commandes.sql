-- Alertes push des nouvelles commandes (admin), même navigateur fermé / téléphone verrouillé.
create extension if not exists pg_net;

-- Clés VAPID générées par la fonction « order-push » elle-même : table privée (aucune politique, RLS active).
create table if not exists public.push_vapid (id int primary key check (id = 1), public_key text not null, private_key text not null, created_at timestamptz not null default now());
alter table public.push_vapid enable row level security;
revoke all on public.push_vapid from anon, authenticated;

create table if not exists public.admin_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from anon, authenticated;

alter table public.orders add column if not exists push_sent_at timestamptz;

insert into public.admin_fn_sections (fn, sections) values
  ('admin_push_subscribe', array['*']), ('admin_push_unsubscribe', array['*']), ('admin_push_status', array['*'])
on conflict (fn) do update set sections = excluded.sections;

-- Clé publique (non secrète) pour l'abonnement côté navigateur.
create or replace function public.push_public_key() returns text language sql stable security definer set search_path = public as $$
  select public_key from push_vapid where id = 1;
$$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

create or replace function public.admin_push_subscribe(_sub jsonb, _ua text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_push_subscribe');
  if coalesce(_sub->>'endpoint', '') !~ '^https://' then raise exception 'Abonnement invalide.'; end if;
  insert into admin_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (_sub->>'endpoint', auth.uid(), _sub->'keys'->>'p256dh', _sub->'keys'->>'auth', left(_ua, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, fail_count = 0;
end $$;

create or replace function public.admin_push_unsubscribe(_endpoint text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_push_unsubscribe');
  delete from admin_push_subscriptions where endpoint = _endpoint and user_id = auth.uid();
end $$;

create or replace function public.admin_push_status(_endpoint text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard('admin_push_status');
  return jsonb_build_object('subscribed', exists (select 1 from admin_push_subscriptions where endpoint = _endpoint and user_id = auth.uid()),
    'devices', (select count(*) from admin_push_subscriptions where user_id = auth.uid()));
end $$;
revoke all on function public.admin_push_subscribe(jsonb, text), public.admin_push_unsubscribe(text), public.admin_push_status(text) from public, anon;
grant execute on function public.admin_push_subscribe(jsonb, text), public.admin_push_unsubscribe(text), public.admin_push_status(text) to authenticated;

-- Destinataires : membres actifs ayant accès aux commandes (ou super administrateurs). Réservé au service.
create or replace function public.push_order_recipients() returns table (endpoint text, p256dh text, auth text) language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from admin_push_subscriptions s
  join admin_staff st on st.user_id = s.user_id and st.status = 'active'
  join user_roles r on r.user_id = s.user_id and r.role = 'admin'
  where st.is_super or 'commandes' = any(st.permissions);
$$;
create or replace function public.push_subscription_failed(_endpoint text) returns void language sql security definer set search_path = public as $$
  delete from admin_push_subscriptions where endpoint = _endpoint and fail_count >= 4;
  update admin_push_subscriptions set fail_count = fail_count + 1 where endpoint = _endpoint;
$$;
revoke all on function public.push_order_recipients(), public.push_subscription_failed(text) from public, anon, authenticated;

-- Chaque nouvelle commande appelle la fonction d'envoi (asynchrone : ne ralentit pas la commande).
create or replace function public.orders_push_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/order-push',
    body := jsonb_build_object('order_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new; -- une alerte manquée ne doit jamais bloquer une commande
end $$;
drop trigger if exists orders_push_notify on public.orders;
create trigger orders_push_notify after insert on public.orders for each row execute function public.orders_push_notify();
