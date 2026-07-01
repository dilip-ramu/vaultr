-- ── Migration v58a: hotfix for Batch E · Deploy 1 constraint ────────────────
-- The v58 CHECK on recoverable_invoice_lines.item_type was too narrow —
-- I based it on the v19 declared constraint ('salary','courier','expense')
-- but real data has 'fixed_expense' and 'deduction' too, which entered the
-- system after v19 shipped (either via a later constraint widening or by
-- the constraint being dropped). This migration widens the CHECK to admit
-- the actual value set, so Deploy 3 (the historical backfill) can proceed.
--
-- Safe to run in isolation. No data changes — only constraint definition.
-- Idempotent: DROP IF EXISTS + ADD.

ALTER TABLE recoverable_invoice_lines
  DROP CONSTRAINT IF EXISTS recoverable_invoice_lines_item_type_check;

ALTER TABLE recoverable_invoice_lines
  ADD  CONSTRAINT recoverable_invoice_lines_item_type_check
  CHECK (
    item_type IS NULL OR item_type IN (
      'salary',
      'courier',
      'expense',
      'fixed_expense',
      'deduction',
      'tax_invoice_line'
    )
  );

NOTIFY pgrst, 'reload schema';

-- ── After running this ──────────────────────────────────────────────────
-- Re-run migration_v60_batch_e_3_backfill.sql. It's wrapped in BEGIN;/COMMIT;
-- and the previous failed attempt rolled back — no cleanup needed. The four
-- verification queries at the bottom of v60 apply as before.
