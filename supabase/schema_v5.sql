-- =============================================
-- schema_v5.sql
-- 1. Add name/description field to transactions
-- 2. Rebuild account_balances view to include all
--    columns added in schema_v3 (avatar_url, bank
--    details, open/closing dates, transaction_count)
-- =============================================

-- Add name column to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS name TEXT;


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
  -- V3 columns
  a.avatar_url,
  a.account_number,
  a.branch,
  a.ifsc_code,
  a.swift_code,
  a.bank_address,
  a.open_date,
  a.closing_date,
  -- Calculated balance
  a.initial_balance +
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income'   THEN  t.amount
        WHEN t.type = 'expense'  THEN -t.amount
        WHEN t.type = 'transfer' AND t.account_id    = a.id THEN -t.amount
        WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN  t.amount
        ELSE 0
      END
    ), 0) AS balance,
  -- Convenience count so AccountCard doesn't need a separate RPC call
  COUNT(t.id) AS transaction_count
FROM accounts a
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id;
