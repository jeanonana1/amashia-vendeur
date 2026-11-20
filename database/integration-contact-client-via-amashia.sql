-- Version sans fournisseur : le livreur ne reçoit jamais le numéro du client.
-- Il demande à Amachia d'appeler le client ; l'admin reçoit la demande en direct (avec le numéro), appelle et répond.
create table if not exists public.courier_contact_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  reason text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'done', 'unreachable', 'cancelled')),
  admin_note text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists courier_contact_requests_recent on public.courier_contact_requests (created_at desc);
alter table public.courier_contact_requests enable row level security;
revoke all on public.courier_contact_requests from anon, authenticated;
alter table public.courier_feed drop constraint if exists courier_feed_kind_check;
alter table public.courier_feed add constraint courier_feed_kind_check check (kind in ('new_order', 'assigned', 'taken', 'cancelled', 'contact'));

-- Le numéro du client n'est plus jamais transmis à l'application livreur (appel relayé Twilio si activé, sinon via Amachia).
create or replace function public.courier_order_json(o public.orders, d public.deliveries, _full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at,
    'customer_first_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'Client'),
    'customer_name', case when _full then o.full_name end,
    'customer_phone', null,
    'has_customer_phone', coalesce(o.contact_phone, '') <> '',
    'masked_call', _full and d.status in ('assigned', 'picked_up', 'in_transit') and masked_calls_enabled() and coalesce(o.contact_phone, '') <> '',
    'contact_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'reason', q.reason, 'status', q.status, 'admin_note', q.admin_note, 'created_at', q.created_at, 'handled_at', q.handled_at) order by q.created_at desc), '[]'::jsonb)
      from courier_contact_requests q where q.order_id = o.id and q.courier_id = d.courier_id and q.created_at > now() - interval '3 days'),
    'city', o.city, 'district', o.district,
    'address_details', case when _full then o.address_details end,
    'shipping_mode', o.shipping_mode, 'agency_name', o.shipping_agency_name,
    'agency_depot', (select concat_ws(', ', a.depot_district, a.depot_city) from shipping_agencies a where a.id = o.shipping_agency_id),
    'agency_address', (select a.address from shipping_agencies a where a.id = o.shipping_agency_id),
    'agency_phone', case when _full then (select a.phone from shipping_agencies a where a.id = o.shipping_agency_id) end,
    'payment_method', o.payment_method,
    'total', o.total_fcfa,
    'to_collect', case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.product_title, 'qty', i.quantity, 'price', i.unit_price_fcfa, 'color', i.color, 'size', i.size,
        'seller', (select s.name from sellers s where s.id = i.seller_id)) order by i.created_at), '[]'::jsonb)
      from order_items i where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'delivery_status', d.status, 'courier_pay', d.courier_pay, 'cash_collected', d.cash_collected, 'note', d.note,
    'assigned_at', d.assigned_at, 'picked_at', d.picked_at, 'delivered_at', d.delivered_at, 'failed_at', d.failed_at);
$$;
revoke all on function public.courier_order_json(public.orders, public.deliveries, boolean) from public, anon, authenticated;

create or replace function public.courier_request_contact(_order uuid, _reason text, _note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers := current_courier(); d deliveries; rid uuid;
begin
  if c.id is null then raise exception 'Compte livreur non activé.'; end if;
  select * into d from deliveries where order_id = _order and courier_id = c.id;
  if d.id is null or d.status not in ('assigned', 'picked_up', 'in_transit') then raise exception 'Possible uniquement pendant une livraison en cours.'; end if;
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'Choisissez la raison de l''appel.'; end if;
  if exists (select 1 from courier_contact_requests q where q.order_id = _order and q.courier_id = c.id and q.status = 'pending') then
    raise exception 'Une demande est déjà en cours pour ce client : Amachia l''appelle.';
  end if;
  insert into courier_contact_requests (order_id, courier_id, reason, note) values (_order, c.id, left(btrim(_reason), 120), nullif(left(btrim(coalesce(_note, '')), 300), ''))
  returning id into rid;
  return jsonb_build_object('id', rid);
end $$;
revoke all on function public.courier_request_contact(uuid, text, text) from public, anon;
grant execute on function public.courier_request_contact(uuid, text, text) to authenticated;

insert into public.admin_fn_sections (fn, sections) values
  ('admin_contact_requests', array['livreurs', 'commandes']), ('admin_handle_contact_request', array['livreurs', 'commandes'])
on conflict (fn) do update set sections = excluded.sections;

create or replace function public.admin_contact_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard('admin_contact_requests');
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'reason', q.reason, 'note', q.note, 'admin_note', q.admin_note,
      'created_at', q.created_at, 'handled_at', q.handled_at, 'order_id', o.id, 'order_number', o.order_number,
      'customer_name', o.full_name, 'customer_phone', o.contact_phone, 'district', o.district, 'city', o.city,
      'courier', c.full_name, 'courier_phone', c.phone, 'handled_by', (select full_name from admin_staff s where s.user_id = q.handled_by))
      order by (q.status = 'pending') desc, q.created_at desc)
    from (select * from courier_contact_requests where status = 'pending' or created_at > now() - interval '7 days' order by created_at desc limit 100) q
    join orders o on o.id = q.order_id left join couriers c on c.id = q.courier_id), '[]'::jsonb);
end $$;

create or replace function public.admin_handle_contact_request(_id uuid, _status text, _note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare q courier_contact_requests;
begin
  perform admin_guard('admin_handle_contact_request');
  if _status not in ('done', 'unreachable', 'cancelled') then raise exception 'Statut inconnu.'; end if;
  update courier_contact_requests set status = _status, admin_note = nullif(left(btrim(coalesce(_note, '')), 300), ''), handled_by = auth.uid(), handled_at = now()
  where id = _id returning * into q;
  if q.id is null then raise exception 'Demande introuvable.'; end if;
  -- le livreur est prévenu en direct dans son application
  insert into courier_feed (kind, order_id, courier_id, city, info) values ('contact', q.order_id, q.courier_id, null,
    jsonb_build_object('contact_answer', true, 'status', _status, 'admin_note', q.admin_note, 'order_number', (select order_number from orders where id = q.order_id)));
end $$;
revoke all on function public.admin_contact_requests(), public.admin_handle_contact_request(uuid, text, text) from public, anon;
grant execute on function public.admin_contact_requests(), public.admin_handle_contact_request(uuid, text, text) to authenticated;

-- Notifications de l'admin : les demandes d'appel en attente (section Livreurs)
CREATE OR REPLACE FUNCTION public.admin_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.admin_guard('admin_notifications');
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select * from (
      (select jsonb_build_object('id', 'o-' || o.id, 'type', 'order', 'section', 'commandes', 'severity', 'info',
         'title', 'Nouvelle commande ' || o.order_number, 'message', coalesce(o.full_name, 'Client') || ' · ' || o.total_fcfa || ' FCFA · ' || coalesce(o.city, ''),
         'created_at', o.created_at) x from orders o where o.created_at > now() - interval '30 days' order by o.created_at desc limit 30)
      union all
      (select jsonb_build_object('id', 'cc-' || q.id, 'type', 'courier_call', 'section', 'livreurs', 'severity', 'warning',
         'title', 'Livreur : appeler le client ' || coalesce(o.order_number, ''), 'message', coalesce(c.full_name, 'Livreur') || ' · ' || q.reason, 'created_at', q.created_at)
       from courier_contact_requests q left join orders o on o.id = q.order_id left join couriers c on c.id = q.courier_id
       where q.status = 'pending' and q.created_at > now() - interval '7 days' limit 20)
      union all
      (select jsonb_build_object('id', 'c-' || o.id, 'type', 'cancel', 'section', 'commandes', 'severity', 'warning',
         'title', 'Commande annulée ' || o.order_number, 'message', coalesce(o.full_name, 'Client'), 'created_at', o.updated_at)
       from orders o where o.status = 'Annulée' and o.updated_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'r-' || r.id, 'type', 'return', 'section', 'commandes', 'severity', 'warning',
         'title', 'Demande de retour ' || r.ref, 'message', r.product_title || ' · ' || r.reason, 'created_at', r.created_at)
       from return_requests r where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'w-' || w.id, 'type', 'withdrawal', 'section', 'finance', 'severity', 'warning',
         'title', 'Demande de retrait', 'message', coalesce(s.name, 'Boutique') || ' · ' || w.amount || ' FCFA', 'created_at', w.created_at)
       from seller_withdrawals w left join sellers s on s.id = w.seller_id where w.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'p-' || r.id, 'type', 'report', 'section', 'produits', 'severity', 'danger',
         'title', 'Produit signalé', 'message', coalesce(p.title, '') || ' · ' || r.reason, 'created_at', r.created_at)
       from product_reports r left join products p on p.id = r.listing_id where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 's-' || r.id, 'type', 'support', 'section', 'vendeurs', 'severity', 'info',
         'title', 'Message d''un vendeur', 'message', r.subject, 'created_at', r.created_at)
       from seller_support_requests r where r.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'a-' || a.id, 'type', 'application', 'section', 'clients', 'severity', 'success',
         'title', 'Nouvelle candidature', 'message', a.full_name || ' · ' || a.area, 'created_at', a.created_at)
       from job_applications a where a.created_at > now() - interval '30 days' limit 20)
      union all
      (select jsonb_build_object('id', 'v-' || s.id, 'type', 'seller', 'section', 'vendeurs', 'severity', 'success',
         'title', 'Nouvelle boutique', 'message', s.name, 'created_at', s.created_at)
       from sellers s where s.created_at > now() - interval '30 days' limit 20)
    ) u limit 80
  ) t), '[]'::jsonb);
end $function$;
