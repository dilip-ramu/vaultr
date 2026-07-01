-- ── Migration v58: Batch E · Deploy 1 — unified invoice schema prep ─────────
-- Adds columns to recoverable_invoices + recoverable_invoice_lines so the
-- table can eventually hold reimbursement (Contrast-style) rows alongside
-- tax invoices. NO DATA MOVES in this migration. Existing rows and reads
-- are untouched — the app keeps behaving exactly as before.
--
-- Invariant we hold across every Batch E deploy:
--   SUM(contrast_invoices.total)
--   + SUM(recoverable_invoices.total)
--   + SUM(contrast_invoices_archive.total)   (0 until Deploy 5)
-- must return the same number before and after every deploy. See the
-- verification query at the bottom of this file — run it, note the number,
-- run this migration, run it again, confirm the number matches to the paisa.

-- ── recoverable_invoices ──────────────────────────────────────────────────

-- invoice_type: 'tax_invoice' (the current shape) or 'reimbursement' (what
-- contrast_invoices holds today). Default so every existing row silently
-- becomes a tax invoice — that's correct historical labelling.
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'tax_invoice';

-- Loosen the existing status CHECK to also admit contrast's 'finalized' — we
-- need it to accept future mirror-writes from Deploy 2. We keep the old values
-- so no existing row is invalidated.
ALTER TABLE recoverable_invoices
  DROP CONSTRAINT IF EXISTS recoverable_invoices_status_check;
ALTER TABLE recoverable_invoices
  ADD  CONSTRAINT recoverable_invoices_status_check
  CHECK (status IN ('draft','sent','paid','overdue','cancelled','finalized'));

-- Reimbursement rows carry a YYYY-MM month tag (contrast_invoices.invoice_month).
-- Nullable — tax invoices don't have one.
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS invoice_month TEXT;

-- Index on the type marker so filtering "reimbursement only" and
-- "tax invoice only" stays fast once both kinds share the table.
CREATE INDEX IF NOT EXISTS idx_recoverable_invoices_type
  ON recoverable_invoices (user_id, invoice_type, invoice_date DESC);

-- Add the CHECK for invoice_type LAST — after the column has its default.
ALTER TABLE recoverable_invoices
  DROP CONSTRAINT IF EXISTS recoverable_invoices_invoice_type_check;
ALTER TABLE recoverable_invoices
  ADD  CONSTRAINT recoverable_invoices_invoice_type_check
  CHECK (invoice_type IN ('tax_invoice','reimbursement'));

-- ── recoverable_invoice_lines ─────────────────────────────────────────────

-- Line items today are all shipment/service lines (awb, hsn_sac, qty, rate).
-- Reimbursement lines are salary/courier/expense bundles (item_type +
-- salary_amount + salary_currency + expended_rate). All four columns are
-- nullable — existing rows keep working, new reimbursement lines fill them.
ALTER TABLE recoverable_invoice_lines
  ADD COLUMN IF NOT EXISTS item_type       TEXT,
  ADD COLUMN IF NOT EXISTS salary_amount   DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS salary_currency TEXT,
  ADD COLUMN IF NOT EXISTS expended_rate   DECIMAL(10,4);

ALTER TABLE recoverable_invoice_lines
  DROP CONSTRAINT IF EXISTS recoverable_invoice_lines_item_type_check;
ALTER TABLE recoverable_invoice_lines
  ADD  CONSTRAINT recoverable_invoice_lines_item_type_check
  CHECK (item_type IS NULL OR item_type IN ('salary','courier','expense','tax_invoice_line'));

-- Ensure PostgREST picks up the new columns immediately.
NOTIFY pgrst, 'reload schema';

-- ── Verification: run BEFORE and AFTER this migration, confirm match ─────
-- Copy the query below into a fresh SQL Editor tab and run it twice.
--
--   SELECT
--     (SELECT COALESCE(SUM(total), 0) FROM contrast_invoices)       AS contrast_total,
--     (SELECT COUNT(*)                FROM contrast_invoices)       AS contrast_count,
--     (SELECT COALESCE(SUM(total), 0) FROM recoverable_invoices)    AS recoverable_total,
--     (SELECT COUNT(*)                FROM recoverable_invoices)    AS recoverable_count,
--     (SELECT COALESCE(SUM(total), 0) FROM contrast_invoices)
--       + (SELECT COALESCE(SUM(total), 0) FROM recoverable_invoices) AS grand_total_invoiced,
--     (SELECT COUNT(*)                FROM contrast_invoices)
--       + (SELECT COUNT(*)                FROM recoverable_invoices) AS grand_count;
--
-- Both numbers on the right column must be identical before and after.
-- If they differ by even 0.01 — stop, screenshot both, roll back from the
-- Supabase backup, and report.
