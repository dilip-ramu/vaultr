-- ── Migration v55: track when each account was last reconciled ───────────────
-- Adds accounts.last_reconciled_at + last_reconciled_balance so the Accounts
-- page can show, at-a-glance, which accounts have been checked against the bank
-- recently and which still need attention.
--
-- Stamped from two places (both client-side, no trigger):
--   1. User types the actual bank balance, sees "✓ matches", clicks "Mark as
--      reconciled" → we UPDATE accounts SET last_reconciled_at = now(),
--      last_reconciled_balance = <the balance that matched>.
--   2. User clicks "Log Reconciliation" (creating a plug transaction to close
--      the gap) → same UPDATE right after the insert succeeds.
--
-- Rebuilds account_balances so the columns are read alongside the computed
-- balance in one round-trip (matches the pattern used for credit/loan fields
-- in v39). Balance math is unchanged.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_reconciled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reconciled_balance DECIMAL(14,2);

-- Rebuild account_balances to expose the new columns. Keep every field the
-- previous version returned, in the same order, so no client code breaks.
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
  a.custom_type_id,
  ct.name       AS custom_type_name,
  ct.color      AS custom_type_color,
  ct.icon       AS custom_type_icon,
  ct.avatar_url AS custom_type_avatar_url,
  -- NEW in v55
  a.last_reconciled_at,
  a.last_reconciled_balance,
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
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;

GRANT SELECT ON account_balances TO authenticated;
GRANT SELECT ON account_balances TO anon;

-- PostgREST needs to reload its schema cache before the API can serve the new
-- columns — without this you'll see stale rows until a manual reload.
NOTIFY pgrst, 'reload schema';
