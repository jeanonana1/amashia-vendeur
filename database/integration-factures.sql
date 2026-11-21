-- Factures Amachia : disponibles une fois la commande livrée, même contenu sur le site client et dans l'admin.
-- Numéro séquentiel AMC-AAAA-000001 attribué à la première ouverture de la facture (jamais réutilisé).

-- Informations légales de l'entreprise imprimées sur les factures (modifiables dans l'admin).
-- Tant qu'un champ est vide, il n'apparaît pas sur la facture : aucune donnée inventée.
create table if not exists public.invoice_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Amachia',
  address text, phone text, email text, website text default 'amachia.com',
  capital text, rccm text, niu text, bank_name text, iban text,
  conditions text default 'Retour possible sous 15 jours après la livraison pour tout article non conforme, dans son emballage d''origine. Demande depuis votre espace client Amachia.',
  vat_rate numeric(5,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.invoice_settings (id) values (1) on conflict do nothing;
alter table public.invoice_settings enable row level security;

create sequence if not exists public.invoice_number_seq;
create table if not exists public.order_invoices (
  order_id uuid primary key references public.orders(id) on delete cascade,
  number text not null unique,
  issued_at timestamptz not null default now()
);
alter table public.order_invoices enable row level security;

-- Données de la facture d'une commande livrée (numéro créé au besoin)
create or replace function public.invoice_json(_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders; inv order_invoices; s invoice_settings; p profiles;
begin
  select * into o from orders where id = _order;
  if o.id is null then raise exception 'Commande introuvable.'; end if;
  if o.status <> 'Livrée' then raise exception 'La facture est disponible une fois la commande livrée.'; end if;
  select * into inv from order_invoices where order_id = o.id;
  if inv.order_id is null then
    insert into order_invoices (order_id, number, issued_at)
    values (o.id, 'AMC-' || to_char(coalesce(o.delivered_at, now()) at time zone 'Africa/Douala', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'), coalesce(o.delivered_at, now()))
    on conflict (order_id) do nothing;
    select * into inv from order_invoices where order_id = o.id;
  end if;
  select * into s from invoice_settings where id = 1;
  select * into p from profiles where id = o.user_id;
  return jsonb_build_object(
    'number', inv.number, 'issued_at', inv.issued_at, 'order_number', o.order_number, 'ordered_at', o.created_at,
    'delivered_at', coalesce(o.delivered_at, (select max(d.delivered_at) from deliveries d where d.order_id = o.id and d.status = 'delivered')),
    'customer', jsonb_build_object(
      'name', coalesce(nullif(btrim(o.full_name), ''), p.full_name, 'Client'),
      'district', o.district, 'city', o.city,
      'address', nullif(btrim(regexp_replace(coalesce(o.address_details, ''), '\s*—?\s*GPS:\s*-?[\d.]+,\s*-?[\d.]+', '', 'i')), ''),
      'phone', coalesce(nullif(o.contact_phone, ''), p.phone), 'email', coalesce(nullif(o.contact_email, ''), p.email)),
    'sellers', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', se.name, 'city', se.city, 'slug', se.slug)), '[]'::jsonb)
      from order_items i join sellers se on se.id = i.seller_id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.product_title, 'sku', i.sku, 'color', regexp_replace(coalesce(i.color, ''), '\s*#[0-9a-fA-F]{3,8}$', ''), 'size', i.size,
        'qty', i.quantity, 'unit', i.unit_price_fcfa, 'total', i.unit_price_fcfa * i.quantity, 'seller', se.name) order by i.created_at, i.id), '[]'::jsonb)
      from order_items i left join sellers se on se.id = i.seller_id where i.order_id = o.id and i.seller_status <> 'cancelled'),
    'subtotal', o.subtotal_fcfa, 'discount', coalesce(o.discount_fcfa, 0), 'coupon', o.coupon_code, 'points', coalesce(o.points_used, 0),
    'shipping', coalesce(o.shipping_fee_fcfa, 0), 'shipping_mode', o.shipping_mode, 'agency', o.shipping_agency_name,
    'total', o.total_fcfa, 'payment_method', o.payment_method,
    'company', to_jsonb(s) - 'id' - 'updated_at'
  );
end $$;
revoke all on function public.invoice_json(uuid) from public, anon, authenticated;

-- Site client : le titulaire de la commande (connecté) ou le lien secret de la commande (achat sans compte)
create or replace function public.customer_invoice(_number text, _request uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where order_number = _number;
  if o.id is null or not ((auth.uid() is not null and o.user_id = auth.uid()) or (_request is not null and o.request_key = _request)) then
    raise exception 'Commande introuvable.';
  end if;
  return public.invoice_json(o.id);
end $$;
grant execute on function public.customer_invoice(text, uuid) to anon, authenticated;

-- Admin
create or replace function public.admin_order_invoice(_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_order_detail');
  return public.invoice_json(_id);
end $$;

create or replace function public.admin_invoice_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_order_detail');
  return (select to_jsonb(s) - 'id' from invoice_settings s where id = 1);
end $$;

create or replace function public.admin_save_invoice_settings(_s jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t text := '';
begin
  perform public.admin_guard('admin_save_invoice_settings');
  if coalesce((_s->>'vat_rate')::numeric, 0) < 0 or coalesce((_s->>'vat_rate')::numeric, 0) > 50 then raise exception 'Taux de TVA invalide.'; end if;
  update invoice_settings set
    company_name = coalesce(nullif(btrim(_s->>'company_name'), ''), 'Amachia'),
    address = nullif(btrim(_s->>'address'), ''), phone = nullif(btrim(_s->>'phone'), ''), email = nullif(btrim(_s->>'email'), ''),
    website = nullif(btrim(_s->>'website'), ''), capital = nullif(btrim(_s->>'capital'), ''), rccm = nullif(btrim(_s->>'rccm'), ''),
    niu = nullif(btrim(_s->>'niu'), ''), bank_name = nullif(btrim(_s->>'bank_name'), ''), iban = nullif(btrim(_s->>'iban'), ''),
    conditions = nullif(btrim(_s->>'conditions'), ''), vat_rate = coalesce((_s->>'vat_rate')::numeric, 0), updated_at = now()
  where id = 1;
end $$;

insert into public.admin_fn_sections (fn, sections) values
  ('admin_save_invoice_settings', array['commandes', 'finance'])
on conflict (fn) do update set sections = excluded.sections;
