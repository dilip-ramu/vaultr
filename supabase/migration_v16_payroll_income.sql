-- ── Migration v16: Add income & forex transaction tracking to payroll_months ─
ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS income_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forex_transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL;
