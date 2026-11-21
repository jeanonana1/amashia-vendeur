-- Fiche du livreur ouverte en scannant son code (QR / code-barres de son profil Prime) :
-- identité, véhicule, ce qu'il doit (espèces à reverser), ce qu'Amachia lui doit, et ses livraisons du jour choisi.
create or replace function public.admin_courier_sheet(_code text, _day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c couriers; d date := coalesce(_day, (now() at time zone 'Africa/Douala')::date);
  v text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g')); day jsonb;
begin
  perform public.admin_guard('admin_courier_daily');
  -- accepte « LIV-XXXXXX », « LIVXXXXXX », « XXXXXX » ou une adresse contenant le code
  v := coalesce(substring(v from 'LIV([A-Z0-9]{6})'), right(v, 6));
  select * into c from couriers where replace(courier_code, '-', '') = 'LIV' || v;
  if c.id is null then return null; end if;
  day := (select x from jsonb_array_elements(public.admin_courier_daily(d, d, c.id)) x limit 1);
  return jsonb_build_object(
    'id', c.id, 'code', c.courier_code, 'name', c.full_name, 'photo_url', c.photo_url, 'phone', c.phone, 'email', c.email,
    'city', c.city, 'districts', c.districts, 'status', c.status, 'availability', c.availability,
    'vehicle_type', c.vehicle_type, 'vehicle_brand', c.vehicle_brand, 'vehicle_plate', c.vehicle_plate, 'vehicle_color', c.vehicle_color,
    'pay_per_delivery', c.pay_per_delivery, 'carrier', (select name from carriers where id = c.carrier_id), 'since', c.created_at,
    'last_seen_at', c.last_seen_at, 'day', d,
    'today', coalesce(day, jsonb_build_object('delivered', 0, 'failed', 0, 'cash', 0, 'earned', 0, 'received', 0, 'to_remit', 0, 'paid', 0, 'to_deliver', 0, 'to_collect', 0, 'deliveries', '[]'::jsonb, 'receipts', '[]'::jsonb)),
    'totals', jsonb_build_object(
      'delivered', (select count(*) from deliveries x where x.courier_id = c.id and x.status = 'delivered'),
      'failed', (select count(*) from deliveries x where x.courier_id = c.id and x.status = 'failed'),
      'cash', (select coalesce(sum(x.cash_collected), 0) from deliveries x where x.courier_id = c.id and x.status = 'delivered'),
      'received', (select coalesce(sum(r.amount), 0) from courier_cash_receipts r where r.courier_id = c.id),
      'earned', (select coalesce(sum(x.courier_pay), 0) from deliveries x where x.courier_id = c.id and x.status = 'delivered'),
      'paid', (select coalesce(sum(p.amount), 0) from courier_payouts p where p.courier_id = c.id),
      'ongoing', (select count(*) from deliveries x where x.courier_id = c.id and x.status in ('assigned', 'picked_up', 'in_transit'))),
    -- journées où il reste des espèces à reverser (pour encaisser directement depuis la fiche)
    'unpaid_days', (select coalesce(jsonb_agg(x order by x->>'day' desc), '[]'::jsonb) from jsonb_array_elements(public.admin_courier_daily(d - 90, d, c.id)) x where (x->>'to_remit')::int > 0)
  );
end $$;
