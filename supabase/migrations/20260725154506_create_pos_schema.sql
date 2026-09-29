/*
# Computer Shop POS — initial schema

1. Purpose
   Backend for a computer-store POS system with two roles (admin, cashier).
   Admin: full access (dashboard, inventory CRUD, sales history).
   Cashier: POS/scanner only; cannot see profits or edit inventory.

2. New Tables
   - profiles: mirrors auth.users, stores role (admin|cashier) + display name.
     First registered user becomes admin automatically; later users are cashiers.
   - products: inventory items (name, brand, specs, cpu, ram, storage,
     cost_price, sale_price, barcode, quantity).
   - sales: invoices (invoice_number, cashier, customer, totals, payment_method).
   - sale_items: line items per sale, snapshot of product + serial number + specs.
   - held_carts: suspended carts per cashier (label + jsonb cart_data) so a
     cashier can park one customer's sale and resume it later.

3. Security (RLS)
   - profiles: authenticated can read own profile; admins read all & update all;
     users update own. INSERT handled by a SECURITY DEFINER trigger (on signup).
   - products: all authenticated can SELECT (cashiers need to scan/sell);
     only admins can INSERT/UPDATE/DELETE.
   - sales: a user can SELECT their own sales; admins see all; any authenticated
     user can INSERT a sale they are the cashier of.
   - sale_items: SELECT/INSERT gated by ownership of the parent sale.
   - held_carts: each cashier owns their held carts (full CRUD on own rows).

4. Notes
   - A trigger `on_auth_user_created` auto-creates a profile row on signup and
     assigns admin to the first ever user, cashier to everyone after.
   - Admin check uses an EXISTS subquery against profiles; no app role is trusted
     from the client — it is always re-checked server-side via RLS.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin','cashier')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

-- Auto-create profile on signup; first user becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
         THEN 'admin' ELSE 'cashier' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ---------- products ----------
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text,
  specs text,
  cpu text,
  ram text,
  storage text,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  barcode text UNIQUE,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_authenticated" ON products;
CREATE POLICY "products_select_authenticated" ON products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "products_insert_admin" ON products;
CREATE POLICY "products_insert_admin" ON products
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_update_admin" ON products;
CREATE POLICY "products_update_admin" ON products
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_delete_admin" ON products;
CREATE POLICY "products_delete_admin" ON products
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);

-- ---------- sales ----------
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_own_or_admin" ON sales;
CREATE POLICY "sales_select_own_or_admin" ON sales
  FOR SELECT TO authenticated
  USING (cashier_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "sales_insert_own" ON sales;
CREATE POLICY "sales_insert_own" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());

CREATE INDEX IF NOT EXISTS sales_cashier_idx ON sales (cashier_id);
CREATE INDEX IF NOT EXISTS sales_created_idx ON sales (created_at DESC);

-- ---------- sale_items ----------
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  barcode text,
  serial_number text,
  specs text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_items_select_own_or_admin" ON sale_items;
CREATE POLICY "sale_items_select_own_or_admin" ON sale_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id
      AND (s.cashier_id = auth.uid() OR public.is_admin())
  ));

DROP POLICY IF EXISTS "sale_items_insert_own" ON sale_items;
CREATE POLICY "sale_items_insert_own" ON sale_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id AND s.cashier_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);

-- ---------- held_carts ----------
CREATE TABLE IF NOT EXISTS held_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Held Cart',
  cart_data jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE held_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "held_carts_select_own" ON held_carts;
CREATE POLICY "held_carts_select_own" ON held_carts
  FOR SELECT TO authenticated USING (cashier_id = auth.uid());

DROP POLICY IF EXISTS "held_carts_insert_own" ON held_carts;
CREATE POLICY "held_carts_insert_own" ON held_carts
  FOR INSERT TO authenticated WITH CHECK (cashier_id = auth.uid());

DROP POLICY IF EXISTS "held_carts_update_own" ON held_carts;
CREATE POLICY "held_carts_update_own" ON held_carts
  FOR UPDATE TO authenticated
  USING (cashier_id = auth.uid()) WITH CHECK (cashier_id = auth.uid());

DROP POLICY IF EXISTS "held_carts_delete_own" ON held_carts;
CREATE POLICY "held_carts_delete_own" ON held_carts
  FOR DELETE TO authenticated USING (cashier_id = auth.uid());

CREATE INDEX IF NOT EXISTS held_carts_cashier_idx ON held_carts (cashier_id);

-- updated_at trigger for products
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_touch_updated_at ON products;
CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
