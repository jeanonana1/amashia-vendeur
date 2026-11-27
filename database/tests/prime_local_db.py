# Construit une base locale « primetest » : structure copiée de la production (tables utiles, sans contraintes),
# fonctions existantes, quelques données réelles (réglages, agences, quartiers, produits), puis la migration Prime.
import json, os, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__))
sample = json.load(open(f"{D}/sample.json"))[0]["j"]

def lit(v):
    return "'" + json.dumps(v).replace("'", "''") + "'"

out = ["""
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; end if; end $r$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key, created_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', 'aal2') $$;
create function public.admin_req_header(text) returns text language sql as $$ select null::text $$;
"""]
out.append(open(f"{D}/stub_tables.sql").read())
out.append(open(f"{D}/cities.sql").read())
out.append("""create table public.email_outbox (id bigserial primary key, kind text not null check (kind in ('order_confirmed','seller_new_order','order_shipped','order_delivered','order_cancelled')), order_id uuid not null, seller_id uuid, status text not null default 'pending', attempts int not null default 0, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz);
create table public.reviews (product_id uuid, rating int); create table public.seller_flash_sales (product_id uuid, kind text, value int, starts_at timestamptz, ends_at timestamptz, is_active boolean); create table public.sellers (id uuid, name text, slug text, is_active boolean);
create table public.order_invoices (order_id uuid); create table public.invoice_settings (id int);
create function public.email_outbox_kick() returns void language sql as $$ select $$;""")
out.append("alter table public.admin_fn_sections add primary key (fn);")
out.append("alter table public.prime_subscriptions add primary key (id); alter table public.prime_subscriptions alter column id set default gen_random_uuid();")
out.append("alter table public.prime_plans add primary key (id); alter table public.orders add primary key (id); alter table public.products add primary key (id);")
out.append("alter table public.prime_subscriptions alter column starts_at set not null; alter table public.prime_subscriptions alter column expires_at set not null;")
for tbl, key in [("platform_settings", "ps"), ("cm_districts", "cd"), ("shipping_agencies", "sa"), ("prime_plans", "pp")]:
    for row in sample[key] or []:
        out.append(f"insert into public.{tbl} select * from jsonb_populate_record(null::public.{tbl}, {lit(row)});")
for row in sample["pr"]:
    out.append(f"insert into public.products (id, title, price_fcfa, category_slug, is_prime, is_published, stock) select * from jsonb_to_record({lit(row)}) as x(id uuid, title text, price_fcfa int, category_slug text, is_prime boolean, is_published boolean, stock int);")
out.append(open(f"{D}/stub_funcs.sql").read())
out.insert(0, "set check_function_bodies = off;")
open(f"{D}/build.sql", "w").write("\n".join(out))
print("build.sql écrit")
