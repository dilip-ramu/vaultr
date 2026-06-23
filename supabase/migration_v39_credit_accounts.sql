-- ── Migration v39: credit cards & loans — limits, rates, EMI ─────────────────
-- Adds the fields needed to track credit cards (limit, APR) and loans
-- (original principal, rate, EMI), and rebuilds the account_balances view so
-- the app can read them alongside the computed balance. Existing data is
-- untouched — all new columns are nullable.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS credit_limit   DECIMAL(14,2),   -- credit card sanctioned limit
  ADD COLUMN IF NOT EXISTS loan_principal DECIMAL(14,2),   -- loan original/sanctioned amount
  ADD COLUMN IF NOT EXISTS interest_rate  DECIMAL(6,3),    -- annual % (APR), cards & loans
  ADD COLUMN IF NOT EXISTS emi_amount     DECIMAL(14,2);   -- loan monthly instalment

-- Rebuild account_balances to expose the new columns (plus statement_day /
-- statement_due_day which earlier views omitted). Balance math is unchanged.
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
  a.avatar_url,
  a.account_number,
  a.branch,
  a.ifsc_code,
  a.swift_code,
  a.bank_address,
  a.open_date,
  a.closing_date,
  a.statement_day,
  a.statement_due_day,
  a.credit_limit,
  a.loan_principal,
  a.interest_rate,
  a.emi_amount,
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
  COUNT(t.id) AS transaction_count
FROM accounts a
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id;
