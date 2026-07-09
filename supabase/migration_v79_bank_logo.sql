-- v79 — Bank logo per account + expose it (and bank_customer_id) on the
-- account_balances view the app reads from.
-- A separate image from the account's identity avatar (account_holder photo),
-- used on the accounts page + the shareable "bank details" card.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_logo_url TEXT;

-- The app reads accounts through this view; new base-table columns must be
-- appended here (CREATE OR REPLACE VIEW only allows adding columns at the end).
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id, a.user_id, a.household_id, a.created_by, a.name, a.type, a.currency,
  a.color, a.icon, a.include_in_net_worth, a.is_active, a.created_at,
  a.initial_balance, a.avatar_url, a.account_number, a.branch, a.ifsc_code,
  a.swift_code, a.bank_address, a.open_date, a.closing_date, a.statement_day,
  a.statement_due_day, a.credit_limit, a.loan_principal, a.interest_rate,
  a.emi_amount, a.custom_type_id,
  ct.name       AS custom_type_name,
  ct.color      AS custom_type_color,
  ct.icon       AS custom_type_icon,
  ct.avatar_url AS custom_type_avatar_url,
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
  COUNT(t.id) AS transaction_count,
  a.account_holder,
  a.card_network,
  a.card_expiry_month,
  a.card_expiry_year,
  -- NEW (appended at end to satisfy CREATE OR REPLACE VIEW rules)
  a.bank_customer_id,
  a.bank_logo_url
FROM accounts a
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;

GRANT SELECT ON account_balances TO authenticated;
GRANT SELECT ON account_balances TO anon;

NOTIFY pgrst, 'reload schema';
