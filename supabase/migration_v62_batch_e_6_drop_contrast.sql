-- ── Migration v62: Batch E · Deploy 6 — final cutover ────────────────────────
-- Drops the historical contrast_invoices + contrast_invoice_items tables
-- entirely. Every read/write has already flipped to recoverable_invoices in
-- Deploys 4 + 5. The user has explicitly accepted that any invoice still
-- residing only in the old table (there shouldn't be any — Deploy 3
-- backfilled + Deploy 5 flipped writes) will be lost.
--
-- Prep in this migration, done in strict order for FK safety:
--   1. Refresh claim_contrast_invoice_number to no longer read contrast_invoices
--   2. Drop the Deploy 2 mirror trigger + helper functions
--   3. Drop the four FK constraints pointing at contrast_invoices(id)
--   4. Add four new FKs pointing at recoverable_invoices(id) — every value in
--      transactions/payroll_months/bills/recoverable_invoices.contrast_invoice_id
--      already matches a row there (same UUIDs, backfilled in Deploy 3)
--   5. DROP TABLE contrast_invoices CASCADE — takes contrast_invoice_items with it
--
-- After this migration, contrast_invoice_id column names still exist on
-- transactions/payroll_months/bills/recoverable_invoices. Renaming those to
-- reimbursement_invoice_id is aesthetic and touches a lot of code; leave for
-- a future cleanup. The FK now points at the right table.

BEGIN;

-- ── 1. Redefine the PI numbering RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_contrast_invoice_number(p_month text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_seq int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('contrast_inv_' || auth.uid()::text));

  SELECT COALESCE(MAX((regexp_match(invoice_number, '-(\d+)$'))[1]::int), 0) + 1
  INTO next_seq
  FROM recoverable_invoices
  WHERE user_id      = auth.uid()
    AND invoice_type = 'reimbursement';

  RETURN 'PI-' || replace(p_month, '-', '') || '-' || LPAD(next_seq::text, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION claim_contrast_invoice_number(text) TO authenticated;

-- ── 2. Drop the dual-write trigger + its helper functions ────────────────

DROP TRIGGER  IF EXISTS contrast_invoices_mirror_trg      ON contrast_invoices;
DROP TRIGGER  IF EXISTS contrast_invoice_items_mirror_trg ON contrast_invoice_items;

DROP FUNCTION IF EXISTS trg_contrast_invoices_mirror();
DROP FUNCTION IF EXISTS trg_contrast_invoice_items_mirror();
DROP FUNCTION IF EXISTS batch_e_mirror_contrast_invoice(TEXT, contrast_invoices);
DROP FUNCTION IF EXISTS batch_e_mirror_contrast_invoice_item(TEXT, contrast_invoice_items);

-- ── 3. Drop the FKs that reference contrast_invoices(id) ─────────────────
--     Constraint names weren't set explicitly — PostgreSQL auto-named them
--     using the pattern "<table>_<column>_fkey".

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_contrast_invoice_id_fkey;
ALTER TABLE payroll_months
  DROP CONSTRAINT IF EXISTS payroll_months_contrast_invoice_id_fkey;
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_contrast_invoice_id_fkey;
ALTER TABLE recoverable_invoices
  DROP CONSTRAINT IF EXISTS recoverable_invoices_contrast_invoice_id_fkey;

-- ── 4. Add new FKs pointing at recoverable_invoices(id) ─────────────────
--     Same shape — ON DELETE SET NULL. Every existing value in the FK
--     columns matches a row in recoverable_invoices because Deploy 3
--     backfilled every contrast row with the same UUID.

ALTER TABLE transactions
  ADD CONSTRAINT transactions_contrast_invoice_id_fkey
  FOREIGN KEY (contrast_invoice_id)
  REFERENCES  recoverable_invoices(id)
  ON DELETE SET NULL;

ALTER TABLE payroll_months
  ADD CONSTRAINT payroll_months_contrast_invoice_id_fkey
  FOREIGN KEY (contrast_invoice_id)
  REFERENCES  recoverable_invoices(id)
  ON DELETE SET NULL;

ALTER TABLE bills
  ADD CONSTRAINT bills_contrast_invoice_id_fkey
  FOREIGN KEY (contrast_invoice_id)
  REFERENCES  recoverable_invoices(id)
  ON DELETE SET NULL;

ALTER TABLE recoverable_invoices
  ADD CONSTRAINT recoverable_invoices_contrast_invoice_id_fkey
  FOREIGN KEY (contrast_invoice_id)
  REFERENCES  recoverable_invoices(id)
  ON DELETE SET NULL;

-- ── 5. Drop the old tables ───────────────────────────────────────────────
--     CASCADE takes contrast_invoice_items and any residual dependencies
--     (indexes, policies) with it.

DROP TABLE IF EXISTS contrast_invoice_items CASCADE;
DROP TABLE IF EXISTS contrast_invoices      CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── VERIFICATION ─────────────────────────────────────────────────────────
-- After running: check nothing broke.
--
--   -- All invoices — old + newly-created — must show up here:
--   SELECT invoice_type, COUNT(*), COALESCE(SUM(total),0) AS total_billed
--   FROM recoverable_invoices
--   GROUP BY invoice_type;
--
--   -- Confirm the old tables are gone:
--   SELECT to_regclass('contrast_invoices')       AS old_invoices,
--          to_regclass('contrast_invoice_items')  AS old_items;
--   -- Both should return NULL.
--
--   -- Try creating a reimbursement from the app after the code deploys —
--   -- it must land with a fresh PI-YYYYMM-NNN number.
