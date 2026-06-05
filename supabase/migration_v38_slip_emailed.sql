-- ── Migration v38: remember when a salary slip was emailed ───────────────────
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS slip_emailed_at TIMESTAMPTZ;
