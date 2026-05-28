-- ── Migration v14c: Payroll payment tracking ───────────────────────────────

-- Mark payroll months as paid and link to account
ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS is_paid             BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Track generated transaction per entry
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
