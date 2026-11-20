-- Sonnerie « Nouvelle commande » pour les vendeurs : alerte push (même navigateur fermé) + sonnerie dans l'espace vendeur
create table if not exists public.seller_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
alter table public.seller_push_subscriptions enable row level security; -- accès par les fonctions ci-dessous uniquement

create or replace function public.seller_push_subscribe(_sub jsonb, _ua text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from sellers where owner_id = auth.uid()) then raise exception 'Réservé aux vendeurs.'; end if;
  if coalesce(_sub->>'endpoint', '') !~ '^https://' or coalesce(_sub#>>'{keys,p256dh}', '') = '' or coalesce(_sub#>>'{keys,auth}', '') = '' then
    raise exception 'Abonnement invalide.';
  end if;
  insert into seller_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (_sub->>'endpoint', auth.uid(), _sub#>>'{keys,p256dh}', _sub#>>'{keys,auth}', left(_ua, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, fail_count = 0;
end $$;
create or replace function public.seller_push_unsubscribe(_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from seller_push_subscriptions where endpoint = _endpoint and user_id = auth.uid();
$$;
create or replace function public.seller_push_status(_endpoint text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('subscribed', exists (select 1 from seller_push_subscriptions where endpoint = _endpoint and user_id = auth.uid()));
$$;
grant execute on function public.seller_push_subscribe(jsonb, text), public.seller_push_unsubscribe(text), public.seller_push_status(text) to authenticated;

-- Une seule alerte par vendeur et par commande
create table if not exists public.seller_order_alerts (
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (order_id, seller_id)
);
alter table public.seller_order_alerts enable row level security;

create or replace function public.order_items_seller_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare fresh int;
begin
  if new.seller_id is null then return new; end if;
  insert into seller_order_alerts (order_id, seller_id) values (new.order_id, new.seller_id) on conflict do nothing;
  get diagnostics fresh = row_count;
  if fresh > 0 then
    perform net.http_post(
      url := 'https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/seller-order-push',
      body := jsonb_build_object('order_id', new.order_id, 'seller_id', new.seller_id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000);
  end if;
  return new;
exception when others then
  return new; -- une alerte manquée ne doit jamais bloquer une commande
end $$;
drop trigger if exists order_items_seller_push on public.order_items;
create trigger order_items_seller_push after insert on public.order_items for each row execute function public.order_items_seller_push();

-- Pour la sonnerie dans l'espace vendeur : dernière commande reçue et nombre de commandes depuis la dernière visite
create or replace function public.seller_latest_order(_since timestamptz default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'latest', (select max(oi.created_at) from order_items oi join sellers s on s.id = oi.seller_id where s.owner_id = auth.uid()),
    'new_count', (select count(distinct oi.order_id) from order_items oi join sellers s on s.id = oi.seller_id join orders o on o.id = oi.order_id
                  where s.owner_id = auth.uid() and o.status <> 'Annulée' and _since is not null and oi.created_at > _since));
$$;
grant execute on function public.seller_latest_order(timestamptz) to authenticated;
