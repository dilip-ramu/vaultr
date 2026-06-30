-- ── Migration v49: per-customer billing currency ────────────────────────────
-- The Contrast invoice was hard-coded to EUR — INR expenses converted at a
-- user-fixed rate. Generalise so each reimbursable customer can have their
-- own billing currency.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'EUR';
