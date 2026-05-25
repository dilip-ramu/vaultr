-- =============================================
-- VAULTR v6 Migration
-- Run in Supabase SQL Editor
-- =============================================

-- 1. avatar_url for categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. avatar_url for custom_account_types
ALTER TABLE custom_account_types ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Link accounts to custom types
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS custom_type_id UUID REFERENCES custom_account_types(id) ON DELETE SET NULL;

-- 4. Overrides for built-in account types (rename / recolor)
CREATE TABLE IF NOT EXISTS builtin_account_type_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL CHECK (type_key IN ('checking','savings','credit','cash','investment','loan','other')),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366F1',
  icon TEXT NOT NULL DEFAULT 'wallet',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type_key)
);
ALTER TABLE builtin_account_type_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own builtin overrides" ON builtin_account_type_overrides
  FOR ALL USING (user_id = auth.uid());

-- 5. Rebuild account_balances view to include custom type columns
DROP VIEW IF EXISTS account_balances;
CREATE VIEW account_balances AS
SELECT
  a.id, a.user_id, a.household_id, a.created_by,
  a.name, a.type, a.currency, a.color, a.icon,
  a.include_in_net_worth, a.is_active, a.created_at, a.initial_balance,
  a.avatar_url,
  a.account_number, a.branch, a.ifsc_code,
  a.swift_code, a.bank_address, a.open_date, a.closing_date,
  a.custom_type_id,
  ct.name  AS custom_type_name,
  ct.color AS custom_type_color,
  ct.icon  AS custom_type_icon,
  ct.avatar_url AS custom_type_avatar_url,
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
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;
