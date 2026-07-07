-- ── Migration v73: account/card identity details + debit cards ─────────────
-- Unifies the Accounts and Cards screens into one page where every account
-- renders as a colored "card face" that can show its identity details.
--
-- Existing columns already cover most of it: account_number, ifsc_code,
-- branch, swift_code, credit_limit, statement_day, statement_due_day.
-- This migration adds the few that were missing, plus a debit_cards table so
-- one or more debit cards can be linked to a (non-credit) account.
--
-- NOTE ON SECURITY: we intentionally do NOT store CVV anywhere. CVV is
-- prohibited from storage by card-network rules and is useless for reference.
-- Full numbers are stored so the UI can mask to last-4 and reveal on tap.

-- 1. New identity columns on accounts (credit cards + holder name)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_holder    TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_network       TEXT;   -- Visa / Mastercard / Amex / RuPay …
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_expiry_month  INT;    -- 1–12
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_expiry_year   INT;    -- 4-digit

-- 2. Debit cards linked to a funding account (usually a savings/current a/c).
--    An account can have several (e.g. primary + add-on). CVV NOT stored.
CREATE TABLE IF NOT EXISTS debit_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  label         TEXT,                    -- e.g. "Platinum Debit", holder-friendly name
  card_number   TEXT,                    -- full PAN; UI masks to last-4
  card_network  TEXT,                    -- Visa / Mastercard / RuPay …
  card_holder   TEXT,
  expiry_month  INT,
  expiry_year   INT,
  color         TEXT,                    -- optional per-card colour override
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debit_cards_user    ON debit_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_debit_cards_account ON debit_cards(account_id);

ALTER TABLE debit_cards ENABLE ROW LEVEL SECURITY;
GRANT ALL ON debit_cards TO authenticated;
DROP POLICY IF EXISTS "debit_cards_all" ON debit_cards;
CREATE POLICY "debit_cards_all" ON debit_cards FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Expose the new columns through the account_balances view the app reads.
--    (The view lists columns explicitly, so new columns must be added here.)
--    Appended at the end so CREATE OR REPLACE keeps the existing column order.
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
  -- NEW in v73 (appended at end to satisfy CREATE OR REPLACE VIEW rules)
  a.account_holder,
  a.card_network,
  a.card_expiry_month,
  a.card_expiry_year
FROM accounts a
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;

GRANT SELECT ON account_balances TO authenticated;
GRANT SELECT ON account_balances TO anon;

NOTIFY pgrst, 'reload schema';
