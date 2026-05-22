-- =============================================
-- VAULTR — Schema v2 Migration
-- Run this AFTER schema.sql in Supabase SQL Editor
-- =============================================

-- =============================================
-- HOUSEHOLDS (family sharing)
-- =============================================
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Household',
  invite_code TEXT UNIQUE NOT NULL DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- =============================================
-- UPDATE PROFILES (must come BEFORE household RLS policies
-- because the policies reference profiles.household_id)
-- =============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT;

-- Now safe to create household RLS policies (profiles.household_id exists)
DROP POLICY IF EXISTS "Household members can view" ON households;
CREATE POLICY "Household members can view" ON households
  FOR SELECT USING (
    id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Household creator can update" ON households;
CREATE POLICY "Household creator can update" ON households
  FOR UPDATE USING (created_by = auth.uid());

-- =============================================
-- UPDATE EXISTING TABLES — add household_id + created_by
-- =============================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'received'
  CHECK (direction IN ('received', 'sent'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'due_on_receipt'
  CHECK (payment_terms IN ('due_on_receipt', 'net_7', 'net_15', 'net_30', 'net_60', 'net_90', 'custom'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  gst_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own customers" ON customers;
CREATE POLICY "Users can CRUD own customers" ON customers
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Add foreign key for customer_id on bills
ALTER TABLE bills ADD CONSTRAINT bills_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- =============================================
-- ATTACHMENTS (receipts, invoices)
-- =============================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own attachments" ON attachments;
CREATE POLICY "Users can CRUD own attachments" ON attachments
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================
-- ACTIVITY NOTES (Monday.com-style comments)
-- =============================================
CREATE TABLE IF NOT EXISTS activity_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE activity_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own notes" ON activity_notes;
CREATE POLICY "Users can CRUD own notes" ON activity_notes
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================
-- CUSTOM ACCOUNT TYPES
-- =============================================
CREATE TABLE IF NOT EXISTS custom_account_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366F1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE custom_account_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own custom types" ON custom_account_types;
CREATE POLICY "Users can CRUD own custom types" ON custom_account_types
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================
-- SUPABASE STORAGE BUCKETS
-- (Run these separately in Storage section or via SQL)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vaultr-attachments', 'vaultr-attachments', false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('vaultr-avatars', 'vaultr-avatars', true, 2097152,
   ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vaultr-attachments' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view their own attachments" ON storage.objects;
CREATE POLICY "Users can view their own attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vaultr-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vaultr-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vaultr-avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vaultr-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'vaultr-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- UPDATED SIGNUP FUNCTION (creates household)
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_household_id UUID;
  v_invite_code TEXT;
BEGIN
  -- Check if joining existing household via invite code
  v_invite_code := NEW.raw_user_meta_data->>'invite_code';

  IF v_invite_code IS NOT NULL AND v_invite_code != '' THEN
    -- Join existing household
    SELECT id INTO v_household_id
    FROM households
    WHERE invite_code = v_invite_code
    LIMIT 1;
  END IF;

  -- If no household found, create new one
  IF v_household_id IS NULL THEN
    INSERT INTO households (name, created_by)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'My') || '''s Household',
      NEW.id
    )
    RETURNING id INTO v_household_id;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, full_name, household_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    v_household_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- UPDATED account_balances VIEW (includes household_id)
-- =============================================
DROP VIEW IF EXISTS account_balances;
CREATE VIEW account_balances AS
SELECT
  a.id,
  a.user_id,
  a.household_id,
  a.created_by,
  a.name,
  a.type,
  a.currency,
  a.color,
  a.icon,
  a.include_in_net_worth,
  a.is_active,
  a.created_at,
  a.initial_balance,
  a.initial_balance +
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income' THEN t.amount
        WHEN t.type = 'expense' THEN -t.amount
        WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
        WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
        ELSE 0
      END
    ), 0) AS balance
FROM accounts a
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id;

-- =============================================
-- UPDATED seed_default_categories (uses household_id)
-- =============================================
CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_household_id UUID;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles WHERE id = p_user_id;

  INSERT INTO categories (user_id, household_id, name, type, icon, color) VALUES
    (p_user_id, v_household_id, 'Food & Dining', 'expense', 'utensils', '#F97316'),
    (p_user_id, v_household_id, 'Transport', 'expense', 'car', '#3B82F6'),
    (p_user_id, v_household_id, 'Shopping', 'expense', 'shopping-bag', '#EC4899'),
    (p_user_id, v_household_id, 'Entertainment', 'expense', 'film', '#8B5CF6'),
    (p_user_id, v_household_id, 'Bills & Utilities', 'expense', 'zap', '#F59E0B'),
    (p_user_id, v_household_id, 'Health & Medical', 'expense', 'heart-pulse', '#EF4444'),
    (p_user_id, v_household_id, 'Education', 'expense', 'graduation-cap', '#6366F1'),
    (p_user_id, v_household_id, 'Home & Rent', 'expense', 'home', '#14B8A6'),
    (p_user_id, v_household_id, 'Travel', 'expense', 'plane', '#0EA5E9'),
    (p_user_id, v_household_id, 'Personal Care', 'expense', 'shirt', '#A855F7'),
    (p_user_id, v_household_id, 'Subscriptions', 'expense', 'wifi', '#64748B'),
    (p_user_id, v_household_id, 'Gifts & Donations', 'expense', 'gift', '#D946EF'),
    (p_user_id, v_household_id, 'Others', 'expense', 'more-horizontal', '#6B7280'),
    (p_user_id, v_household_id, 'Salary', 'income', 'briefcase', '#10B981'),
    (p_user_id, v_household_id, 'Freelance', 'income', 'laptop', '#6366F1'),
    (p_user_id, v_household_id, 'Business', 'income', 'building', '#F59E0B'),
    (p_user_id, v_household_id, 'Investment Returns', 'income', 'trending-up', '#3B82F6'),
    (p_user_id, v_household_id, 'Rental Income', 'income', 'home', '#14B8A6'),
    (p_user_id, v_household_id, 'Interest', 'income', 'percent', '#8B5CF6'),
    (p_user_id, v_household_id, 'Gift Received', 'income', 'gift', '#EC4899'),
    (p_user_id, v_household_id, 'Other Income', 'income', 'more-horizontal', '#6B7280');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- HELPER: Get transaction count per account (for deletion protection)
-- =============================================
CREATE OR REPLACE FUNCTION get_account_transaction_count(p_account_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM transactions
  WHERE account_id = p_account_id OR to_account_id = p_account_id;
$$ LANGUAGE sql SECURITY DEFINER;
