-- Schema only. Execute once on a fresh project. No user or credential seeds.
BEGIN;
-- Schema source: 20260507093733_1775706d-b6d7-4932-aad3-08b22c589cde.sql

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'particulier',
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  category TEXT,
  gender TEXT,
  birth_date DATE,
  country TEXT,
  city TEXT,
  language TEXT DEFAULT 'fr',
  payment_method TEXT,
  shop_address TEXT,
  neighborhood TEXT,
  region TEXT,
  share_location BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, account_type, first_name, last_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'particulier'),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Schema source: 20260507093751_5442ae64-b35c-41da-91f8-894afac37e1b.sql
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Schema source: 20260510164040_4484e9f9-9764-4eac-8ca3-27e42fd09966.sql

-- Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS niu text;

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  category text,
  sku text,
  status text NOT NULL DEFAULT 'active',
  images text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Sellers insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Sellers update own products" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Sellers delete own products" ON public.products FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


ALTER TABLE public.products REPLICA IDENTITY FULL;

-- Seller documents
CREATE TABLE IF NOT EXISTS public.seller_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_documents TO authenticated;
GRANT ALL ON public.seller_documents TO service_role;
ALTER TABLE public.seller_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own docs" ON public.seller_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Sellers insert own docs" ON public.seller_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Sellers update own docs" ON public.seller_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Sellers delete own docs" ON public.seller_documents FOR DELETE USING (auth.uid() = user_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('seller-documents', 'seller-documents', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Seller documents bucket: private, user can only access own folder
CREATE POLICY "Users read own docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'seller-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'seller-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own docs" ON storage.objects FOR UPDATE
  USING (bucket_id = 'seller-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own docs" ON storage.objects FOR DELETE
  USING (bucket_id = 'seller-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Product images bucket: public read, owner write
CREATE POLICY "Anyone view product images" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
CREATE POLICY "Users upload own product images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own product images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own product images" ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);


-- Schema source: 20260510164053_10f504b6-8007-4676-9a1d-55bf3bd4c54e.sql

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


-- Schema source: 20260610110823_1d5d6c40-a1b9-4e68-9b93-874f3a3969fd.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_name text,
  ADD COLUMN IF NOT EXISTS shop_description text,
  ADD COLUMN IF NOT EXISTS shop_logo_url text,
  ADD COLUMN IF NOT EXISTS shop_banner_url text,
  ADD COLUMN IF NOT EXISTS shop_email text;

-- Schema source: 20260613223356_d2020666-d03c-4bd1-b25b-457c5bbb63c1.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'simple';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS attributes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS specifications jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bundle_items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS virtual_files jsonb DEFAULT '[]'::jsonb;

-- Schema source: 20260715211242_5178760e-5166-4d5a-8d98-112ae648214e.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price numeric;

-- Schema source: 20260814201011_cc6697af-bf10-45dc-a76e-ff26380bf73f.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant_images jsonb DEFAULT '[]'::jsonb;

CREATE TABLE public.product_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  reporter_id uuid,
  reporter_name text,
  reporter_contact text,
  reason text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reports TO authenticated;
GRANT ALL ON public.product_reports TO service_role;

ALTER TABLE public.product_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view reports on own products" ON public.product_reports
  FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers update reports on own products" ON public.product_reports
  FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers delete reports on own products" ON public.product_reports
  FOR DELETE TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Authenticated users can report products" ON public.product_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE TRIGGER product_reports_updated_at BEFORE UPDATE ON public.product_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  compare_at_price numeric,
  stock integer NOT NULL DEFAULT 0,
  images text[] NOT NULL DEFAULT '{}'::text[],
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  variant_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketing_angles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'paused', 'archived')),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
GRANT SELECT ON public.marketplace_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public views published marketplace listings" ON public.marketplace_listings FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Authenticated views published marketplace listings" ON public.marketplace_listings FOR SELECT TO authenticated USING (status = 'published');
CREATE POLICY "Sellers view own marketplace listings" ON public.marketplace_listings FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers publish own marketplace listings" ON public.marketplace_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id AND EXISTS (SELECT 1 FROM public.products WHERE products.id = product_id AND products.user_id = auth.uid()));
CREATE POLICY "Sellers update own marketplace listings" ON public.marketplace_listings FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers delete own marketplace listings" ON public.marketplace_listings FOR DELETE TO authenticated USING (auth.uid() = seller_id);
CREATE TRIGGER marketplace_listings_updated_at BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_contact text NOT NULL,
  delivery_address text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT 'À la livraison',
  paid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.marketplace_orders TO authenticated;
GRANT ALL ON public.marketplace_orders TO service_role;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own marketplace orders" ON public.marketplace_orders FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers update own marketplace orders" ON public.marketplace_orders FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers delete own marketplace orders" ON public.marketplace_orders FOR DELETE TO authenticated USING (auth.uid() = seller_id);
CREATE TRIGGER marketplace_orders_updated_at BEFORE UPDATE ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.place_marketplace_order(_product_id uuid, _customer_name text, _customer_contact text, _delivery_address text, _quantity integer, _payment_method text)
RETURNS TABLE(order_number text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _product public.products%ROWTYPE;
  _listing public.marketplace_listings%ROWTYPE;
  _order_number text;
  _amount numeric;
BEGIN
  IF _quantity < 1 OR _quantity > 100 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
  IF length(trim(_customer_name)) < 2 OR length(trim(_customer_contact)) < 5 OR length(trim(_delivery_address)) < 5 THEN RAISE EXCEPTION 'Informations client incomplètes'; END IF;
  SELECT * INTO _product FROM public.products WHERE id = _product_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit indisponible'; END IF;
  SELECT * INTO _listing FROM public.marketplace_listings WHERE product_id = _product_id AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche non publiée'; END IF;
  IF _product.stock < _quantity THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  _amount := _product.price * _quantity;
  _order_number := 'AMA-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.marketplace_orders (order_number, listing_id, product_id, seller_id, customer_name, customer_contact, delivery_address, quantity, unit_price, amount, payment_method)
  VALUES (_order_number, _listing.id, _product.id, _product.user_id, trim(_customer_name), trim(_customer_contact), trim(_delivery_address), _quantity, _product.price, _amount, trim(_payment_method));
  UPDATE public.products SET stock = stock - _quantity WHERE id = _product.id;
  UPDATE public.marketplace_listings SET stock = stock - _quantity WHERE id = _listing.id;
  RETURN QUERY SELECT _order_number, _amount;
END;
$$;
REVOKE ALL ON FUNCTION public.place_marketplace_order(uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_marketplace_order(uuid, text, text, text, integer, text) TO service_role;
CREATE INDEX marketplace_listings_seller_idx ON public.marketplace_listings(seller_id, published_at DESC);
CREATE INDEX marketplace_orders_seller_idx ON public.marketplace_orders(seller_id, created_at DESC);
COMMIT;
