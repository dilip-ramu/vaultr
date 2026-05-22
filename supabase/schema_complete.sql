-- =============================================
-- VAULTR — Complete Database Setup
-- Run THIS FILE ONLY in Supabase SQL Editor
-- First do: DROP SCHEMA public CASCADE; CREATE SCHEMA public;
-- Then run this whole file
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- HOUSEHOLDS
-- =============================================
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Household',
  invite_code TEXT UNIQUE NOT NULL DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  avatar_url TEXT,
  nickname TEXT,
  household_id UUID REFERENCES households(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Household policies (profiles.household_id now exists)
CREATE POLICY "Household members can view" ON households
  FOR SELECT USING (id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Household creator can update" ON households
  FOR UPDATE USING (created_by = auth.uid());

-- =============================================
-- ACCOUNTS
-- =============================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  created_by UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'other')),
  currency TEXT NOT NULL DEFAULT 'INR',
  initial_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6366F1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  include_in_net_worth BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Extended bank details (v3)
  avatar_url TEXT,
  account_number TEXT,
  branch TEXT,
  ifsc_code TEXT,
  swift_code TEXT,
  bank_address TEXT,
  open_date DATE,
  closing_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  icon TEXT NOT NULL DEFAULT 'more-horizontal',
  color TEXT NOT NULL DEFAULT '#6B7280',
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
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
CREATE POLICY "Users can CRUD own customers" ON customers
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- PAYEES (v4)
-- =============================================
CREATE TABLE payees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'business', 'other')),
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE payees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own payees" ON payees
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- TRANSACTIONS
-- =============================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  created_by UUID REFERENCES auth.users(id),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee_id UUID REFERENCES payees(id) ON DELETE SET NULL,
  name TEXT,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  original_currency TEXT NOT NULL DEFAULT 'INR',
  original_amount NUMERIC(18,2),
  exchange_rate_used NUMERIC(18,6),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  bill_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own transactions" ON transactions
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- =============================================
-- BILLS
-- =============================================
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  created_by UUID REFERENCES auth.users(id),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  direction TEXT NOT NULL DEFAULT 'received' CHECK (direction IN ('received', 'sent')),
  payment_terms TEXT DEFAULT 'due_on_receipt'
    CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','net_60','net_90','custom')),
  invoice_number TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('daily','weekly','monthly','yearly')),
  recurrence_end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  settled_at TIMESTAMPTZ,
  follow_up_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own bills" ON bills
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- ATTACHMENTS
-- =============================================
CREATE TABLE attachments (
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
CREATE POLICY "Users can CRUD own attachments" ON attachments
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- ACTIVITY NOTES
-- =============================================
CREATE TABLE activity_notes (
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
CREATE POLICY "Users can CRUD own notes" ON activity_notes
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- CUSTOM ACCOUNT TYPES
-- =============================================
CREATE TABLE custom_account_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366F1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE custom_account_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own custom types" ON custom_account_types
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- CURRENCY RATES
-- =============================================
CREATE TABLE currency_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  currency TEXT NOT NULL,
  market_rate NUMERIC(18,6) NOT NULL,
  expended_rate NUMERIC(18,6),
  billing_rate NUMERIC(18,6),
  expended_pct NUMERIC(5,2) DEFAULT 5.00,
  billing_pct NUMERIC(5,2) DEFAULT 5.00,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own currency rates" ON currency_rates
  FOR ALL USING (user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_currency_rates_currency_date
  ON currency_rates (currency, effective_from DESC);

-- =============================================
-- ACCOUNT BALANCES VIEW (v5 — includes all columns)
-- =============================================
CREATE VIEW account_balances AS
SELECT
  a.id, a.user_id, a.household_id, a.created_by,
  a.name, a.type, a.currency, a.color, a.icon,
  a.include_in_net_worth, a.is_active, a.created_at, a.initial_balance,
  a.avatar_url, a.account_number, a.branch, a.ifsc_code,
  a.swift_code, a.bank_address, a.open_date, a.closing_date,
  a.initial_balance + COALESCE(SUM(
    CASE
      WHEN t.type = 'income'   THEN  t.amount
      WHEN t.type = 'expense'  THEN -t.amount
      WHEN t.type = 'transfer' AND t.account_id    = a.id THEN -t.amount
      WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN  t.amount
      ELSE 0
    END
  ), 0) AS balance,
  COUNT(t.id) AS transaction_count
FROM accounts a
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id;

-- =============================================
-- STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vaultr-attachments', 'vaultr-attachments', false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('vaultr-avatars', 'vaultr-avatars', true, 2097152,
   ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vaultr-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Users can view their own attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'vaultr-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'vaultr-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'vaultr-avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vaultr-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'vaultr-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'vaultr-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION get_account_transaction_count(p_account_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM transactions
  WHERE account_id = p_account_id OR to_account_id = p_account_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
DECLARE v_household_id UUID;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles WHERE id = p_user_id;
  INSERT INTO categories (user_id, household_id, name, type, icon, color) VALUES
    (p_user_id, v_household_id, 'Food & Dining',     'expense', 'utensils',       '#F97316'),
    (p_user_id, v_household_id, 'Transport',          'expense', 'car',            '#3B82F6'),
    (p_user_id, v_household_id, 'Shopping',           'expense', 'shopping-bag',   '#EC4899'),
    (p_user_id, v_household_id, 'Entertainment',      'expense', 'film',           '#8B5CF6'),
    (p_user_id, v_household_id, 'Bills & Utilities',  'expense', 'zap',            '#F59E0B'),
    (p_user_id, v_household_id, 'Health & Medical',   'expense', 'heart-pulse',    '#EF4444'),
    (p_user_id, v_household_id, 'Education',          'expense', 'graduation-cap', '#6366F1'),
    (p_user_id, v_household_id, 'Home & Rent',        'expense', 'home',           '#14B8A6'),
    (p_user_id, v_household_id, 'Travel',             'expense', 'plane',          '#0EA5E9'),
    (p_user_id, v_household_id, 'Personal Care',      'expense', 'shirt',          '#A855F7'),
    (p_user_id, v_household_id, 'Subscriptions',      'expense', 'wifi',           '#64748B'),
    (p_user_id, v_household_id, 'Gifts & Donations',  'expense', 'gift',           '#D946EF'),
    (p_user_id, v_household_id, 'Others',             'expense', 'more-horizontal','#6B7280'),
    (p_user_id, v_household_id, 'Salary',             'income',  'briefcase',      '#10B981'),
    (p_user_id, v_household_id, 'Freelance',          'income',  'laptop',         '#6366F1'),
    (p_user_id, v_household_id, 'Business',           'income',  'building',       '#F59E0B'),
    (p_user_id, v_household_id, 'Investment Returns', 'income',  'trending-up',    '#3B82F6'),
    (p_user_id, v_household_id, 'Rental Income',      'income',  'home',           '#14B8A6'),
    (p_user_id, v_household_id, 'Interest',           'income',  'percent',        '#8B5CF6'),
    (p_user_id, v_household_id, 'Gift Received',      'income',  'gift',           '#EC4899'),
    (p_user_id, v_household_id, 'Other Income',       'income',  'more-horizontal','#6B7280');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SIGNUP TRIGGER
-- Creates household + profile when user signs up
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_household_id UUID;
  v_invite_code TEXT;
BEGIN
  v_invite_code := NEW.raw_user_meta_data->>'invite_code';

  IF v_invite_code IS NOT NULL AND v_invite_code != '' THEN
    SELECT id INTO v_household_id FROM households
    WHERE invite_code = v_invite_code LIMIT 1;
  END IF;

  IF v_household_id IS NULL THEN
    INSERT INTO households (name, created_by)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'My') || '''s Household', NEW.id)
    RETURNING id INTO v_household_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, household_id)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', v_household_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
