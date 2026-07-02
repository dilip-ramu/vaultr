-- ── Migration v69: per-company invoice template + accent ──────────────────
-- Feature 1: each of the user's own companies can pick a different invoice /
-- salary-slip LAYOUT and an accent colour, so documents from different
-- companies look distinct (the user sells different products from each).
--
--   • invoice_template — structural layout: 'classic' | 'modern' | 'minimal'
--   • invoice_accent   — accent colour as a #RRGGBB hex, recolours headers,
--                        table, totals and rules
--
-- Both are NOT NULL with sensible defaults so every existing company keeps
-- rendering exactly as before (classic + the app's brand green) until the
-- user opts into something else. No backfill needed.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_template TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS invoice_accent   TEXT NOT NULL DEFAULT '#2A7A50';

-- Constrain the template to the known set. Added after the column has its
-- default so existing rows (all 'classic') satisfy it.
ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_invoice_template_check;
ALTER TABLE companies
  ADD  CONSTRAINT companies_invoice_template_check
  CHECK (invoice_template IN ('classic','modern','minimal'));

NOTIFY pgrst, 'reload schema';
