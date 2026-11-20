-- =====================================================================
-- Notifications vendeur : créées automatiquement par la base à chaque
-- événement important, affichées sur la cloche et la page Notifications.
-- =====================================================================
create table if not exists public.seller_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,              -- compte du vendeur (auth.uid())
  kind text not null,                  -- order | cancel | review | report | stock | published | follower | payout | return
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists seller_notifications_owner_idx on public.seller_notifications (owner_id, created_at desc);
create index if not exists seller_notifications_unread_idx on public.seller_notifications (owner_id) where read_at is null;

alter table public.seller_notifications enable row level security;
drop policy if exists "notifications: lecture" on public.seller_notifications;
create policy "notifications: lecture" on public.seller_notifications for select to authenticated using (owner_id = auth.uid());
drop policy if exists "notifications: suppression" on public.seller_notifications;
create policy "notifications: suppression" on public.seller_notifications for delete to authenticated using (owner_id = auth.uid());
revoke all on public.seller_notifications from anon;
grant select, delete on public.seller_notifications to authenticated;

create or replace function public.notify_seller(_owner uuid, _kind text, _title text, _body text, _link text)
returns void language sql security definer set search_path = public as $$
  insert into public.seller_notifications(owner_id, kind, title, body, link)
  select _owner, _kind, _title, _body, _link where _owner is not null;
$$;
revoke all on function public.notify_seller(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.seller_unread_notifications()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.seller_notifications where owner_id = auth.uid() and read_at is null;
$$;
grant execute on function public.seller_unread_notifications() to authenticated;

create or replace function public.mark_notifications_read(_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.seller_notifications set read_at = now()
  where owner_id = auth.uid() and read_at is null and (_ids is null or id = any(_ids));
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---- Événements ----
create or replace function public.fmt_fcfa(n numeric) returns text language sql immutable as $$
  select replace(to_char(coalesce(n, 0), 'FM999G999G999'), ',', ' ') || ' FCFA';
$$;

-- nouvelle commande (une notification par article)
create or replace function public.notif_order_item() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; num text;
begin
  select owner_id into owner from public.sellers where id = new.seller_id;
  select order_number into num from public.orders where id = new.order_id;
  perform public.notify_seller(owner, 'order', 'Nouvelle commande ' || coalesce(num, ''),
    new.quantity || ' × ' || left(new.product_title, 80) || ' — ' || public.fmt_fcfa(new.unit_price_fcfa * new.quantity), '/dashboard/commandes');
  return new;
end $$;
drop trigger if exists notif_order_item on public.order_items;
create trigger notif_order_item after insert on public.order_items for each row execute function public.notif_order_item();

-- commande annulée par le client
create or replace function public.notif_order_cancel() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'Annulée' and old.status is distinct from 'Annulée' then
    for r in select distinct s.owner_id from public.order_items oi join public.sellers s on s.id = oi.seller_id where oi.order_id = new.id loop
      perform public.notify_seller(r.owner_id, 'cancel', 'Commande annulée ' || new.order_number, 'Le client a annulé sa commande.', '/dashboard/commandes');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists notif_order_cancel on public.orders;
create trigger notif_order_cancel after update of status on public.orders for each row execute function public.notif_order_cancel();

-- nouvel avis
create or replace function public.notif_review() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; title text;
begin
  select s.owner_id, p.title into owner, title from public.products p join public.sellers s on s.id = p.seller_id where p.id = new.product_id;
  perform public.notify_seller(owner, 'review', 'Nouvel avis ' || repeat('★', greatest(1, least(5, new.rating))),
    left(coalesce(nullif(new.author_name, ''), 'Un client') || ' sur « ' || left(coalesce(title, 'votre produit'), 60) || ' »' || coalesce(' : ' || left(new.comment, 90), ''), 220), '/dashboard/avis');
  return new;
end $$;
drop trigger if exists notif_review on public.reviews;
create trigger notif_review after insert on public.reviews for each row execute function public.notif_review();

-- produit signalé
create or replace function public.notif_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_seller(new.seller_id, 'report', 'Produit signalé', 'Motif : ' || coalesce(new.reason, 'non précisé'), '/dashboard/signalements');
  return new;
end $$;
drop trigger if exists notif_report on public.product_reports;
create trigger notif_report after insert on public.product_reports for each row execute function public.notif_report();

-- stock bas (3 unités ou moins) et rupture
create or replace function public.notif_stock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock <= 3 and coalesce(old.stock, 999) > 3 and new.status = 'active' then
    perform public.notify_seller(new.user_id, 'stock',
      case when new.stock <= 0 then 'Rupture de stock' else 'Stock bas' end,
      left(new.name, 80) || ' — ' || greatest(new.stock, 0) || ' unité(s) restante(s)', '/dashboard/reapprovisionnement');
  end if;
  return new;
end $$;
drop trigger if exists notif_stock on public.seller_products;
create trigger notif_stock after update of stock on public.seller_products for each row execute function public.notif_stock();

-- produit mis en ligne sur Amachia
create or replace function public.notif_published() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.published_at is not null and old.published_at is null then
    perform public.notify_seller(new.user_id, 'published', 'Produit en ligne sur Amachia', left(new.name, 120), '/dashboard/produits');
  end if;
  return new;
end $$;
drop trigger if exists notif_published on public.seller_products;
create trigger notif_published after update of published_at on public.seller_products for each row execute function public.notif_published();

-- nouvel abonné
create or replace function public.notif_follower() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; total int;
begin
  select owner_id into owner from public.sellers where id = new.seller_id;
  select count(*) into total from public.seller_followers where seller_id = new.seller_id;
  perform public.notify_seller(owner, 'follower', 'Nouvel abonné', 'Votre boutique compte maintenant ' || total || ' abonné(s).', '/dashboard/boutique');
  return new;
end $$;
drop trigger if exists notif_follower on public.seller_followers;
create trigger notif_follower after insert on public.seller_followers for each row execute function public.notif_follower();

-- retrait : demande enregistrée, puis traitée
create or replace function public.notif_payout() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_seller(new.user_id, 'payout', 'Demande de retrait enregistrée', public.fmt_fcfa(new.amount) || ' via ' || coalesce(new.method, 'votre moyen de retrait'), '/dashboard/paiements');
  elsif new.status is distinct from old.status then
    perform public.notify_seller(new.user_id, 'payout',
      case new.status when 'paid' then 'Retrait effectué' when 'rejected' then 'Retrait refusé' else 'Retrait mis à jour' end,
      public.fmt_fcfa(new.amount) || coalesce(' — ' || new.note, ''), '/dashboard/paiements');
  end if;
  return new;
end $$;
drop trigger if exists notif_payout on public.seller_withdrawals;
create trigger notif_payout after insert or update of status on public.seller_withdrawals for each row execute function public.notif_payout();
