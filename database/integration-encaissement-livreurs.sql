-- Revenus & paiements des livreurs : historique jour par jour + encaissement des espèces perçues.
-- « Perçu » = espèces encaissées auprès des clients (paiement à la livraison) ; « à reverser » = perçu − déjà encaissé par Amachia.
-- Les journées sont comptées à l'heure du Cameroun (Africa/Douala).

create table if not exists public.courier_cash_receipts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  day date not null,
  amount integer not null check (amount > 0),
  method text,
  reference text,
  note text,
  received_at timestamptz not null default now(),
  received_by uuid default auth.uid()
);
create index if not exists courier_cash_receipts_courier_day on public.courier_cash_receipts (courier_id, day);
alter table public.courier_cash_receipts enable row level security; -- lecture / écriture via les fonctions admin uniquement

create or replace function public.cm_day(t timestamptz) returns date language sql immutable as $$ select (t at time zone 'Africa/Douala')::date $$;

-- Historique journalier : une ligne par livreur et par jour d'activité
create or replace function public.admin_courier_daily(_from date, _to date, _courier uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_courier_daily');
  return coalesce((
    with days as (
      select d.courier_id, cm_day(coalesce(d.delivered_at, d.failed_at, d.assigned_at)) as day from deliveries d where d.courier_id is not null
      union select r.courier_id, r.day from courier_cash_receipts r
      union select p.courier_id, cm_day(p.paid_at) from courier_payouts p
    ), rows as (
      select x.courier_id, x.day,
        (select count(*) from deliveries d where d.courier_id = x.courier_id and d.status = 'delivered' and cm_day(d.delivered_at) = x.day) delivered,
        (select count(*) from deliveries d where d.courier_id = x.courier_id and d.status = 'failed' and cm_day(d.failed_at) = x.day) failed,
        (select coalesce(sum(d.cash_collected), 0) from deliveries d where d.courier_id = x.courier_id and d.status = 'delivered' and cm_day(d.delivered_at) = x.day) cash,
        (select coalesce(sum(d.courier_pay), 0) from deliveries d where d.courier_id = x.courier_id and d.status = 'delivered' and cm_day(d.delivered_at) = x.day) earned,
        (select coalesce(sum(r.amount), 0) from courier_cash_receipts r where r.courier_id = x.courier_id and r.day = x.day) received,
        (select coalesce(sum(p.amount), 0) from courier_payouts p where p.courier_id = x.courier_id and cm_day(p.paid_at) = x.day) paid,
        -- colis confiés ce jour-là et pas encore livrés (à livrer)
        (select count(*) from deliveries d where d.courier_id = x.courier_id and d.status in ('assigned', 'picked_up', 'in_transit') and cm_day(d.assigned_at) = x.day) to_deliver,
        (select coalesce(sum(case when o.payment_method ilike '%livraison%' then o.total_fcfa else 0 end), 0) from deliveries d join orders o on o.id = d.order_id
           where d.courier_id = x.courier_id and d.status in ('assigned', 'picked_up', 'in_transit') and cm_day(d.assigned_at) = x.day) to_collect
      from (select distinct courier_id, day from days) x
      where x.day between _from and _to and (_courier is null or x.courier_id = _courier)
    )
    select jsonb_agg(jsonb_build_object(
      'courier_id', r.courier_id, 'day', r.day, 'courier', c.full_name, 'code', c.courier_code, 'photo_url', c.photo_url, 'phone', c.phone,
      'delivered', r.delivered, 'failed', r.failed, 'cash', r.cash, 'earned', r.earned, 'received', r.received, 'to_remit', greatest(0, r.cash - r.received),
      'paid', r.paid, 'to_deliver', r.to_deliver, 'to_collect', r.to_collect,
      'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('order_number', o.order_number, 'status', d.status, 'cash', d.cash_collected, 'pay', d.courier_pay,
            'total', o.total_fcfa, 'payment', o.payment_method, 'district', o.district, 'city', o.city, 'at', coalesce(d.delivered_at, d.failed_at, d.assigned_at)) order by coalesce(d.delivered_at, d.failed_at, d.assigned_at)), '[]'::jsonb)
          from deliveries d join orders o on o.id = d.order_id
          where d.courier_id = r.courier_id and cm_day(coalesce(d.delivered_at, d.failed_at, d.assigned_at)) = r.day),
      'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'amount', x.amount, 'method', x.method, 'reference', x.reference, 'note', x.note, 'received_at', x.received_at,
            'by', (select full_name from admin_staff s where s.user_id = x.received_by)) order by x.received_at), '[]'::jsonb)
          from courier_cash_receipts x where x.courier_id = r.courier_id and x.day = r.day)
    ) order by r.day desc, c.full_name)
    from rows r join couriers c on c.id = r.courier_id
    where r.delivered + r.failed + r.received + r.paid + r.to_deliver > 0
  ), '[]'::jsonb);
end $$;

-- Encaissement : Amachia reçoit du livreur les espèces perçues un jour donné
create or replace function public.admin_confirm_courier_cash(_courier uuid, _day date, _amount integer, _method text default 'cash', _ref text default null, _note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cash int; got int;
begin
  perform public.admin_guard('admin_confirm_courier_cash');
  if _amount is null or _amount <= 0 then raise exception 'Montant invalide.'; end if;
  select coalesce(sum(d.cash_collected), 0) into cash from deliveries d where d.courier_id = _courier and d.status = 'delivered' and cm_day(d.delivered_at) = _day;
  select coalesce(sum(amount), 0) into got from courier_cash_receipts where courier_id = _courier and day = _day;
  if got + _amount > cash then raise exception 'Le montant dépasse ce qui reste à encaisser pour ce jour (% FCFA).', greatest(0, cash - got); end if;
  insert into courier_cash_receipts (courier_id, day, amount, method, reference, note)
  values (_courier, _day, _amount, nullif(_method, ''), nullif(btrim(coalesce(_ref, '')), ''), nullif(btrim(coalesce(_note, '')), ''));
  return jsonb_build_object('received', got + _amount, 'to_remit', cash - got - _amount);
end $$;

insert into public.admin_fn_sections (fn, sections) values
  ('admin_courier_daily', array['livreurs']), ('admin_confirm_courier_cash', array['livreurs'])
on conflict (fn) do update set sections = excluded.sections;

-- Solde global : espèces encore détenues = perçu − encaissé
create or replace function public.admin_courier_cash_totals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_courier_daily');
  return coalesce((select jsonb_object_agg(c.id, jsonb_build_object(
      'cash', (select coalesce(sum(d.cash_collected), 0) from deliveries d where d.courier_id = c.id and d.status = 'delivered'),
      'received', (select coalesce(sum(r.amount), 0) from courier_cash_receipts r where r.courier_id = c.id))) from couriers c), '{}'::jsonb);
end $$;
create or replace function public.admin_pay_courier(_courier uuid, _amount integer, _method text, _ref text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare due int;
begin
  perform public.admin_guard('admin_pay_courier');
  if _amount is null or _amount <= 0 then raise exception 'Montant invalide.'; end if;
  select coalesce((select sum(d.courier_pay) from deliveries d where d.courier_id = _courier and d.status = 'delivered'), 0)
       - coalesce((select sum(p.amount) from courier_payouts p where p.courier_id = _courier), 0) into due;
  if _amount > due then raise exception 'Ce livreur est déjà payé : reste à payer % FCFA.', greatest(due, 0); end if;
  insert into courier_payouts (courier_id, amount, method, reference, note) values (_courier, _amount, nullif(_method, ''), nullif(btrim(_ref), ''), nullif(btrim(_note), ''));
end $$;
