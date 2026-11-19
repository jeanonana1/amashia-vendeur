-- ═══ SKU (code-barres) par produit + contrôles du livreur (récupération et remise du colis) ═══

-- 1) SKU : code EAN-13 interne (préfixe 2 = usage interne), unique, généré par le système, jamais modifiable
create or replace function public.gen_sku() returns text language plpgsql volatile as $$
declare body text; s int; i int; c text;
begin
  loop
    body := '2' || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
    s := 0;
    for i in 1..12 loop s := s + substr(body, i, 1)::int * case when i % 2 = 0 then 3 else 1 end; end loop;
    c := body || ((10 - s % 10) % 10)::text;
    exit when not exists (select 1 from public.products where sku = c) and not exists (select 1 from public.seller_products where sku = c);
  end loop;
  return c;
end $$;

alter table public.products add column if not exists sku text;
alter table public.order_items add column if not exists sku text;
update public.seller_products set sku = null where sku is not null and sku !~ '^\d{13}$';  -- anciens SKU saisis à la main : remplacés
update public.products p set sku = sp.sku from public.seller_products sp where sp.marketplace_product_id = p.id and p.sku is null and sp.sku ~ '^\d{13}$';
update public.products set sku = public.gen_sku() where sku is null;
update public.seller_products sp set sku = p.sku from public.products p where p.id = sp.marketplace_product_id and sp.sku is distinct from p.sku;
update public.seller_products set sku = public.gen_sku() where sku is null;
create unique index if not exists products_sku_key on public.products (sku);
update public.order_items oi set sku = p.sku from public.products p where p.id = oi.product_id and oi.sku is null;

-- produits du catalogue : SKU à la création, puis figé
create or replace function public.products_sku() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.sku := coalesce(nullif(new.sku, ''), public.gen_sku());
  elsif old.sku is not null and new.sku is distinct from old.sku and current_setting('amashia.sku_sync', true) is distinct from 'on' then new.sku := old.sku;
  end if;
  return new;
end $$;
drop trigger if exists products_sku on public.products;
create trigger products_sku before insert or update of sku on public.products for each row execute function public.products_sku();

-- produits du vendeur : SKU généré dès la création (avant publication), figé ensuite
create or replace function public.seller_products_sku() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.sku := public.gen_sku();
  elsif coalesce(old.sku, '') <> '' then new.sku := old.sku;
  else new.sku := public.gen_sku();
  end if;
  return new;
end $$;
drop trigger if exists seller_products_00_sku on public.seller_products;
create trigger seller_products_00_sku before insert or update on public.seller_products for each row execute function public.seller_products_sku();

-- après la publication (trigger « seller_products_publish »), le produit du catalogue prend le même SKU
create or replace function public.seller_products_sku_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.marketplace_product_id is not null and new.sku is not null then
    perform set_config('amashia.sku_sync', 'on', true);
    update public.products set sku = new.sku where id = new.marketplace_product_id and sku is distinct from new.sku;
    perform set_config('amashia.sku_sync', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists seller_products_zz_sku_sync on public.seller_products;
create trigger seller_products_zz_sku_sync before insert or update on public.seller_products for each row execute function public.seller_products_sku_sync();

-- chaque article commandé garde le SKU du produit (contrôle au retrait, même si le produit change ensuite)
create or replace function public.order_items_sku() returns trigger language plpgsql security definer set search_path = public as $$
begin new.sku := coalesce(new.sku, (select p.sku from public.products p where p.id = new.product_id)); return new; end $$;
drop trigger if exists order_items_sku on public.order_items;
create trigger order_items_sku before insert on public.order_items for each row execute function public.order_items_sku();

-- 2) Code de remise par commande (contenu du QR code montré par le client)
alter table public.orders add column if not exists delivery_code text;
update public.orders set delivery_code = upper(substr(md5(random()::text || id::text), 1, 10)) where delivery_code is null;
create or replace function public.orders_delivery_code() returns trigger language plpgsql as $$
begin new.delivery_code := coalesce(new.delivery_code, upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10))); return new; end $$;
drop trigger if exists orders_delivery_code on public.orders;
create trigger orders_delivery_code before insert on public.orders for each row execute function public.orders_delivery_code();

-- la règle de remise s'applique aux livraisons à domicile de Yaoundé et Douala (pas aux expéditions par agence)
create or replace function public.order_needs_handover_check(o public.orders) returns boolean language sql immutable as $$
  select coalesce(o.shipping_mode, '') <> 'agency'
     and lower(translate(coalesce(o.city, ''), 'éèêÉÈÊ', 'eeeeee')) ~ '(yaounde|douala)';
$$;

-- 3) Traçabilité : produits scannés à la récupération, méthode de validation de la livraison
create table if not exists public.delivery_item_scans (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id) on delete set null,
  scanned_code text not null,
  scanned_at timestamptz not null default now()
);
alter table public.delivery_item_scans enable row level security;  -- lecture/écriture uniquement via les fonctions
alter table public.deliveries add column if not exists validation_method text check (validation_method in ('qr', 'order_number'));
alter table public.deliveries add column if not exists validated_at timestamptz;
