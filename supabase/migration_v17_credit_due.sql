-- ── Migration v17: Statement due day for credit card accounts ────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS statement_due_day INTEGER CHECK (statement_due_day >= 1 AND statement_due_day <= 31);
