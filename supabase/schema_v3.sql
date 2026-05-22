-- =============================================
-- VAULTR — Schema v3 Migration
-- Run this AFTER schema_v2.sql in Supabase SQL Editor
-- =============================================

-- =============================================
-- ACCOUNT EXTENDED FIELDS
-- Avatar, bank details, dates
-- =============================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ifsc_code TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS swift_code TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_address TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS open_date DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closing_date DATE;

-- =============================================
-- CUSTOM ACCOUNT TYPES
-- Users can define their own (PPF, NPS, Gold, etc.)
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
-- CURRENCY RATES
-- Market rate, expended rate, billing rate per currency
-- Applied to future bills only (point-in-time)
-- =============================================
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  currency TEXT NOT NULL,              -- e.g. 'USD', 'EUR'
  market_rate NUMERIC(18,6) NOT NULL,  -- live market rate
  expended_rate NUMERIC(18,6),         -- your internal cost rate
  billing_rate NUMERIC(18,6),          -- rate used on invoices/bills
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own currency rates" ON currency_rates;
CREATE POLICY "Users can CRUD own currency rates" ON currency_rates
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Unique index: one active rate per currency per household at a time
-- (handled in app logic by effective_from ordering)

-- =============================================
-- Storage: allow account avatars to reuse vaultr-avatars bucket
-- (bucket already created in v2, just confirming policies)
-- =============================================
