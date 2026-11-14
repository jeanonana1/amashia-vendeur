-- =====================================================================
-- 1. Suivi de commande : le statut côté client suit les statuts fixés par
--    le(s) vendeur(s), avec un historique daté (frise de suivi).
-- 2. Retours produits : demande du client (conditions vérifiées par la base),
--    traitement par le vendeur, notifications.
-- =====================================================================

alter table public.order_items add column if not exists shipped_at timestamptz;
alter table public.order_items add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,          -- received | preparing | shipped | delivered | cancelled | return_*
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);
alter table public.order_events enable row level security;
drop policy if exists "suivi : le client voit sa commande" on public.order_events;
create policy "suivi : le client voit sa commande" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
revoke all on public.order_events from anon;
grant select on public.order_events to authenticated;

create or replace function public.add_order_event(_order uuid, _status text, _label text)
returns void language sql security definer set search_path = public as $$
  insert into public.order_events(order_id, status, label)
  select _order, _status, _label
  where not exists (select 1 from public.order_events e where e.order_id = _order and e.status = _status);
$$;
revoke all on function public.add_order_event(uuid, text, text) from public, anon, authenticated;

-- commande passée → premier jalon
create or replace function public.trg_order_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.add_order_event(new.id, 'received', 'Commande reçue');
  return new;
end $$;
drop trigger if exists order_created_event on public.orders;
create trigger order_created_event after insert on public.orders for each row execute function public.trg_order_created();

-- annulation par le client
create or replace function public.trg_order_cancel_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Annulée' and old.status is distinct from 'Annulée' then
    perform public.add_order_event(new.id, 'cancelled', 'Commande annulée');
  end if;
  return new;
end $$;
drop trigger if exists order_cancel_event on public.orders;
create trigger order_cancel_event after update of status on public.orders for each row execute function public.trg_order_cancel_event();

-- le vendeur change le statut d'un article → dates + statut global de la commande
create or replace function public.trg_item_status() returns trigger language plpgsql security definer set search_path = public as $$
declare st text; n_all int; n_live int; n_prep int; n_ship int; n_deliv int;
begin
  if new.seller_status is not distinct from old.seller_status then return new; end if;
  if new.seller_status = 'shipped' and new.shipped_at is null then new.shipped_at := now(); end if;
  if new.seller_status = 'delivered' then
    new.shipped_at := coalesce(new.shipped_at, now());
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end $$;
drop trigger if exists item_status_dates on public.order_items;
create trigger item_status_dates before update of seller_status on public.order_items for each row execute function public.trg_item_status();

create or replace function public.trg_item_status_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; c record; newst text;
begin
  if new.seller_status is not distinct from old.seller_status then return null; end if;
  select * into o from public.orders where id = new.order_id;
  if o.id is null or o.status = 'Annulée' then return null; end if;
  select count(*) filter (where seller_status <> 'cancelled') live,
         count(*) filter (where seller_status in ('pending','preparing')) prep,
         count(*) filter (where seller_status = 'shipped') ship,
         count(*) filter (where seller_status = 'delivered') deliv,
         count(*) filter (where seller_status = 'preparing') preparing
    into c from public.order_items where order_id = o.id;
  if c.live = 0 then newst := 'Annulée';
  elsif c.prep > 0 then newst := 'En préparation';
  elsif c.ship > 0 then newst := 'Expédiée';
  else newst := 'Livrée';
  end if;
  update public.orders set status = newst, delivered_at = case when newst = 'Livrée' then coalesce(delivered_at, now()) else delivered_at end where id = o.id;
  if new.seller_status = 'preparing' then perform public.add_order_event(o.id, 'preparing', 'En préparation chez le vendeur'); end if;
  if new.seller_status = 'shipped' then perform public.add_order_event(o.id, 'shipped', 'Colis remis au livreur'); end if;
  if newst = 'Livrée' then perform public.add_order_event(o.id, 'delivered', 'Commande livrée'); end if;
  if newst = 'Annulée' then perform public.add_order_event(o.id, 'cancelled', 'Commande annulée par le vendeur'); end if;
  return null;
end $$;
drop trigger if exists item_status_sync on public.order_items;
create trigger item_status_sync after update of seller_status on public.order_items for each row execute function public.trg_item_status_sync();

-- commandes existantes : premier jalon + articles déjà livrés datés
insert into public.order_events(order_id, status, label, created_at)
  select o.id, 'received', 'Commande reçue', o.created_at from public.orders o
  where not exists (select 1 from public.order_events e where e.order_id = o.id and e.status = 'received');
update public.order_items set delivered_at = now() where seller_status = 'delivered' and delivered_at is null;

-- suivi d'une commande du client connecté
create or replace function public.customer_order_tracking(_number text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'created_at', o.created_at, 'delivered_at', o.delivered_at,
    'city', o.city, 'district', o.district, 'total', o.total_fcfa,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', oi.product_title, 'quantity', oi.quantity, 'status', oi.seller_status,
                 'image', (select p.images->>0 from public.products p where p.id = oi.product_id), 'shipped_at', oi.shipped_at, 'delivered_at', oi.delivered_at) order by oi.created_at), '[]'::jsonb)
              from public.order_items oi where oi.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'label', e.label, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
               from public.order_events e where e.order_id = o.id))
  from public.orders o where o.user_id = auth.uid() and upper(o.order_number) = upper(btrim(_number));
$$;
grant execute on function public.customer_order_tracking(text) to authenticated;

-- ------------------------------------------------------------- Retours
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  user_id uuid not null,
  seller_id uuid not null references public.sellers(id),
  product_title text not null,
  quantity integer not null,
  amount integer not null,
  reason text not null,
  details text,
  solution text not null default 'refund',
  photos text[] not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'accepted', 'refused', 'received', 'refunded')),
  seller_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists return_requests_user_idx on public.return_requests (user_id, created_at desc);
create index if not exists return_requests_seller_idx on public.return_requests (seller_id, created_at desc);
alter table public.return_requests enable row level security;
drop policy if exists "retours : le client voit les siens" on public.return_requests;
create policy "retours : le client voit les siens" on public.return_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "retours : le vendeur voit les siens" on public.return_requests;
create policy "retours : le vendeur voit les siens" on public.return_requests for select to authenticated
  using (seller_id in (select id from public.sellers where owner_id = auth.uid()));
revoke all on public.return_requests from anon;
grant select on public.return_requests to authenticated;

-- motifs autorisés et leurs conditions
create or replace function public.return_reasons()
returns jsonb language sql immutable as $$
  select '[
    {"key":"defective","label":"Produit défectueux ou qui ne fonctionne pas","photo":true,"unused":false},
    {"key":"damaged","label":"Arrivé endommagé ou cassé","photo":true,"unused":false},
    {"key":"not_as_described","label":"Ne correspond pas à la description ou aux photos","photo":true,"unused":false},
    {"key":"wrong_item","label":"Mauvais article reçu","photo":true,"unused":false},
    {"key":"missing_parts","label":"Pièces ou accessoires manquants","photo":false,"unused":false},
    {"key":"size","label":"Taille ou couleur qui ne convient pas","photo":false,"unused":true},
    {"key":"changed_mind","label":"Je ne souhaite plus l''article","photo":false,"unused":true}
  ]'::jsonb;
$$;
grant execute on function public.return_reasons() to anon, authenticated;

-- articles du client et possibilité de retour (avec la raison si impossible)
create or replace function public.customer_returnable_items()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'ordered_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'item_id', oi.id, 'order_number', o.order_number, 'ordered_at', o.created_at, 'title', oi.product_title,
      'quantity', oi.quantity, 'amount', oi.unit_price_fcfa * oi.quantity - oi.discount_fcfa, 'color', oi.color, 'options', oi.size,
      'image', (select p.images->>0 from public.products p where p.id = oi.product_id),
      'delivered_at', oi.delivered_at,
      'deadline', oi.delivered_at + interval '15 days',
      'eligible', (oi.seller_status = 'delivered' and o.status <> 'Annulée' and oi.delivered_at + interval '15 days' >= now()
                   and not exists (select 1 from public.return_requests r where r.order_item_id = oi.id and r.status <> 'refused')),
      'why_not', case
        when exists (select 1 from public.return_requests r where r.order_item_id = oi.id and r.status <> 'refused') then 'Un retour est déjà en cours pour cet article.'
        when o.status = 'Annulée' or oi.seller_status = 'cancelled' then 'Commande annulée.'
        when oi.seller_status <> 'delivered' then 'Le retour est possible une fois l''article livré.'
        when oi.delivered_at + interval '15 days' < now() then 'Le délai de 15 jours après la livraison est dépassé.'
        else null end) x
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.user_id = auth.uid() and o.created_at > now() - interval '120 days'
  ) t;
$$;
grant execute on function public.customer_returnable_items() to authenticated;

create or replace function public.request_return(_item uuid, _reason text, _details text, _solution text, _photos text[], _unused boolean)
returns text language plpgsql security definer set search_path = public as $$
declare it record; rule jsonb; ref text;
begin
  if auth.uid() is null then raise exception 'Connectez-vous pour demander un retour.'; end if;
  select x.*, o.user_id as buyer, o.status as order_status into it
    from public.order_items x join public.orders o on o.id = x.order_id where x.id = _item for update of x;
  if it.id is null or it.buyer <> auth.uid() then raise exception 'Article introuvable dans vos commandes.'; end if;
  if it.order_status = 'Annulée' or it.seller_status <> 'delivered' then raise exception 'Le retour est possible une fois l''article livré.'; end if;
  if it.delivered_at + interval '15 days' < now() then raise exception 'Le délai de 15 jours après la livraison est dépassé.'; end if;
  if exists (select 1 from public.return_requests r where r.order_item_id = _item and r.status <> 'refused') then raise exception 'Un retour est déjà en cours pour cet article.'; end if;
  select r into rule from jsonb_array_elements(public.return_reasons()) r where r->>'key' = _reason;
  if rule is null then raise exception 'Choisissez un motif de retour.'; end if;
  if (rule->>'photo')::boolean and coalesce(array_length(_photos, 1), 0) = 0 then raise exception 'Ajoutez au moins une photo du problème.'; end if;
  if (rule->>'unused')::boolean and not coalesce(_unused, false) then raise exception 'Pour ce motif, l''article doit être neuf, non utilisé et dans son emballage d''origine.'; end if;
  if coalesce(_solution, '') not in ('refund', 'exchange', 'credit') then raise exception 'Choisissez une solution.'; end if;
  if coalesce(array_length(_photos, 1), 0) > 3 then raise exception '3 photos au maximum.'; end if;
  ref := 'RET-' || upper(substr(md5(gen_random_uuid()::text), 1, 7));
  insert into public.return_requests(ref, order_id, order_item_id, user_id, seller_id, product_title, quantity, amount, reason, details, solution, photos)
  values (ref, it.order_id, it.id, auth.uid(), it.seller_id, it.product_title, it.quantity, it.unit_price_fcfa * it.quantity - it.discount_fcfa,
          _reason, nullif(btrim(coalesce(_details, '')), ''), _solution, coalesce(_photos, '{}'));
  perform public.add_order_event(it.order_id, 'return_requested', 'Demande de retour envoyée (' || ref || ')');
  return ref;
end $$;
grant execute on function public.request_return(uuid, text, text, text, text[], boolean) to authenticated;

-- traitement par le vendeur
create or replace function public.seller_update_return(_id uuid, _status text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.return_requests%rowtype;
begin
  select * into r from public.return_requests where id = _id and seller_id in (select id from public.sellers where owner_id = auth.uid()) for update;
  if r.id is null then raise exception 'Retour introuvable.'; end if;
  if _status not in ('accepted', 'refused', 'received', 'refunded') then raise exception 'Statut invalide.'; end if;
  if _status = 'refused' and coalesce(btrim(_note), '') = '' then raise exception 'Indiquez au client la raison du refus.'; end if;
  update public.return_requests set status = _status, seller_note = coalesce(nullif(btrim(_note), ''), seller_note), updated_at = now() where id = _id;
  perform public.add_order_event(r.order_id, 'return_' || _status,
    case _status when 'accepted' then 'Retour accepté par le vendeur' when 'refused' then 'Retour refusé par le vendeur'
                 when 'received' then 'Article retourné reçu par le vendeur' else 'Remboursement effectué' end || ' (' || r.ref || ')');
end $$;
grant execute on function public.seller_update_return(uuid, text, text) to authenticated;

-- notification au vendeur
create or replace function public.notif_return() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select owner_id into owner from public.sellers where id = new.seller_id;
  perform public.notify_seller(owner, 'return', 'Demande de retour ' || new.ref,
    left(new.product_title, 80) || ' — ' || coalesce((select r->>'label' from jsonb_array_elements(public.return_reasons()) r where r->>'key' = new.reason), new.reason), '/dashboard/retours');
  return new;
end $$;
drop trigger if exists notif_return on public.return_requests;
create trigger notif_return after insert on public.return_requests for each row execute function public.notif_return();

-- liste des retours du vendeur (sans coordonnées personnelles du client)
create or replace function public.seller_returns()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'ref', r.ref, 'status', r.status, 'product_title', r.product_title, 'quantity', r.quantity, 'amount', r.amount,
    'reason', r.reason, 'reason_label', (select x->>'label' from jsonb_array_elements(public.return_reasons()) x where x->>'key' = r.reason),
    'details', r.details, 'solution', r.solution, 'photos', to_jsonb(r.photos), 'seller_note', r.seller_note,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'order_number', o.order_number,
    'customer_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'delivery_area', concat_ws(', ', nullif(o.district, ''), nullif(o.city, '')),
    'image', (select p.images->>0 from public.products p join public.order_items oi on oi.product_id = p.id where oi.id = r.order_item_id)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.return_requests r join public.orders o on o.id = r.order_id
  where r.seller_id in (select id from public.sellers where owner_id = auth.uid());
$$;
grant execute on function public.seller_returns() to authenticated;
