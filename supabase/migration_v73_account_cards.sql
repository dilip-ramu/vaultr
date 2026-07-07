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

NOTIFY pgrst, 'reload schema';
