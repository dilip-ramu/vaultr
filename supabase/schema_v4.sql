-- =============================================
-- VAULTR — Schema v4 Migration
-- Run this AFTER schema_v3.sql in Supabase SQL Editor
-- =============================================

-- =============================================
-- PAYEES
-- =============================================
CREATE TABLE IF NOT EXISTS payees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal'
    CHECK (type IN ('personal', 'business', 'other')),
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own payees" ON payees;
CREATE POLICY "Users can CRUD own payees" ON payees
  FOR ALL USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================
-- UPDATE TRANSACTIONS — multi-currency + payee
-- =============================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payee_id UUID REFERENCES payees(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate_used NUMERIC(18,6);

-- =============================================
-- UPDATE CURRENCY RATES — add auto-fetch timestamp + custom %
-- =============================================
ALTER TABLE currency_rates ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE currency_rates ADD COLUMN IF NOT EXISTS expended_pct NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE currency_rates ADD COLUMN IF NOT EXISTS billing_pct NUMERIC(5,2) DEFAULT 5.00;

-- Index: fast lookup of latest rate per currency
CREATE INDEX IF NOT EXISTS idx_currency_rates_currency_date
  ON currency_rates (currency, effective_from DESC);
