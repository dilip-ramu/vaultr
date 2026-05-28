-- ── Migration v14a: Add contact + DOB fields to employees ──────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address       TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS email         TEXT;
