-- ── Migration v36: credit card statement tracking ────────────────────────────
-- 1. statement_day: the day of month the card's billing cycle CLOSES
--    (statement_due_day from v17 is the day payment is due).
-- 2. card_statements: one row per card per cycle holding the amount the BANK
--    claims you owe. The app computes its own figure from your transactions;
--    bank_amount − calculated = hidden charges (interest, fees, GST…).

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS statement_day INTEGER
  CHECK (statement_day >= 1 AND statement_day <= 31);

CREATE TABLE IF NOT EXISTS card_statements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date DATE        NOT NULL,           -- cycle close date
  bank_amount    DECIMAL(14,2) NOT NULL,         -- what the bank's statement says
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, statement_date)
);

ALTER TABLE card_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cstmt_all" ON card_statements;
CREATE POLICY "cstmt_all" ON card_statements FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON card_statements TO authenticated;

CREATE INDEX IF NOT EXISTS idx_card_statements_account
  ON card_statements(account_id, statement_date DESC);
