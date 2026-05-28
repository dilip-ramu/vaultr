-- ── Migration v14b: Add description to payroll_months ──────────────────────

ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS description TEXT;
