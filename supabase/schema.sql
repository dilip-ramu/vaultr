-- =============================================
-- VAULTR - Database Schema
-- Run this in your Supabase SQL editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================
-- ACCOUNTS
-- =============================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'other')),
  currency TEXT NOT NULL DEFAULT 'INR',
  initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6366F1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  include_in_net_worth BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
-- TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  bill_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own transactions" ON transactions
  FOR ALL USING (auth.uid() = user_id);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- =============================================
-- BILLS
-- =============================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own bills" ON bills
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- COMPUTED: Account Balance View
-- =============================================
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id,
  a.user_id,
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
-- DEFAULT CATEGORIES (seeded per user via function)
-- =============================================
CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Expense categories
  INSERT INTO categories (user_id, name, type, icon, color) VALUES
    (p_user_id, 'Food & Dining', 'expense', 'utensils', '#F97316'),
    (p_user_id, 'Transport', 'expense', 'car', '#3B82F6'),
    (p_user_id, 'Shopping', 'expense', 'shopping-bag', '#EC4899'),
    (p_user_id, 'Entertainment', 'expense', 'film', '#8B5CF6'),
    (p_user_id, 'Bills & Utilities', 'expense', 'zap', '#F59E0B'),
    (p_user_id, 'Health & Medical', 'expense', 'heart-pulse', '#EF4444'),
    (p_user_id, 'Education', 'expense', 'graduation-cap', '#6366F1'),
    (p_user_id, 'Home & Rent', 'expense', 'home', '#14B8A6'),
    (p_user_id, 'Travel', 'expense', 'plane', '#0EA5E9'),
    (p_user_id, 'Personal Care', 'expense', 'shirt', '#A855F7'),
    (p_user_id, 'Subscriptions', 'expense', 'wifi', '#64748B'),
    (p_user_id, 'Gifts & Donations', 'expense', 'gift', '#D946EF'),
    (p_user_id, 'Others', 'expense', 'more-horizontal', '#6B7280');

  -- Income categories
  INSERT INTO categories (user_id, name, type, icon, color) VALUES
    (p_user_id, 'Salary', 'income', 'briefcase', '#10B981'),
    (p_user_id, 'Freelance', 'income', 'laptop', '#6366F1'),
    (p_user_id, 'Business', 'income', 'building', '#F59E0B'),
    (p_user_id, 'Investment Returns', 'income', 'trending-up', '#3B82F6'),
    (p_user_id, 'Rental Income', 'income', 'home', '#14B8A6'),
    (p_user_id, 'Interest', 'income', 'percent', '#8B5CF6'),
    (p_user_id, 'Gift Received', 'income', 'gift', '#EC4899'),
    (p_user_id, 'Other Income', 'income', 'more-horizontal', '#6B7280');
END;
$$ LANGUAGE plpgsql;
