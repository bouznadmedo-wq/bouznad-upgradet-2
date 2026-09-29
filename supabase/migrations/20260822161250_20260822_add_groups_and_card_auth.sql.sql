/*
# Add groups table and card_auth_ref column

1. New Tables
   - groups: product groups/categories (name only).
2. Modified Tables
   - sales: add card_auth_ref text column (nullable) for card payment references.
3. Security
   - groups: admin-only INSERT/UPDATE/DELETE; all authenticated can SELECT.
*/

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_authenticated" ON groups;
CREATE POLICY "groups_select_authenticated" ON groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "groups_insert_admin" ON groups;
CREATE POLICY "groups_insert_admin" ON groups
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "groups_update_admin" ON groups;
CREATE POLICY "groups_update_admin" ON groups
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "groups_delete_admin" ON groups;
CREATE POLICY "groups_delete_admin" ON groups
  FOR DELETE TO authenticated USING (public.is_admin());

-- Add card_auth_ref to sales if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'card_auth_ref'
  ) THEN
    ALTER TABLE sales ADD COLUMN card_auth_ref text;
  END IF;
END $$;
