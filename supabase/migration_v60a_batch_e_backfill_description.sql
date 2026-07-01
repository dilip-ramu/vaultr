-- ── Migration v60a: hotfix for Batch E · Deploy 3 (missed column) ────────────
-- contrast_invoice_items.description TEXT NOT NULL wasn't mirrored by the
-- Deploy 2 trigger or Deploy 3 backfill. Every mirror line today has an
-- implicit NULL description while the source has real text ("March salary —
-- Employee X", "Courier invoice DHL-123", etc). If Deploy 4 flipped reads
-- to the mirror table right now, every invoice detail page would render
-- blank line descriptions.
--
-- What this migration does:
--   1. Adds description TEXT (nullable) to recoverable_invoice_lines
--   2. Backfills it from contrast_invoice_items by matching ids
--   3. Redefines the mirror trigger from v59 so future new writes also copy
--      description automatically
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ── 1. Add the column (nullable — tax_invoice lines legitimately have no
--       description). ──────────────────────────────────────────────────────

ALTER TABLE recoverable_invoice_lines
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ── 2. Backfill from source. Uses id match since mirror rows share the
--       same primary key as their source. ────────────────────────────────

UPDATE recoverable_invoice_lines rl
   SET description = cii.description
  FROM contrast_invoice_items cii
 WHERE cii.id = rl.id
   AND rl.description IS NULL;

-- ── 3. Redefine the trigger helper from v59 so subsequent writes also
--       copy description. Rest of the mapping stays identical. ──────────

CREATE OR REPLACE FUNCTION batch_e_mirror_contrast_invoice_item(
  _op   TEXT,
  _row  contrast_invoice_items
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  UUID;
BEGIN
  IF _op = 'DELETE' THEN
    DELETE FROM recoverable_invoice_lines WHERE id = _row.id;
    RETURN;
  END IF;

  SELECT user_id INTO _uid FROM contrast_invoices WHERE id = _row.invoice_id;
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO recoverable_invoice_lines (
    id, user_id, invoice_id, allocation_id,
    line_number,
    awb, shipment_date, hsn_sac, qty, base_rate, rate, amount,
    cgst_rate, cgst_amount, sgst_rate, sgst_amount,
    created_at,
    item_type, salary_amount, salary_currency, expended_rate,
    description                          -- ← the fix
  )
  VALUES (
    _row.id, _uid, _row.invoice_id, NULL,
    _row.sort_order,
    '', NULL, '996812', 1, 0, 0, _row.amount_inr,
    0, 0, 0, 0,
    NOW(),
    _row.item_type, _row.salary_amount, 'EUR', _row.expended_rate,
    _row.description                     -- ← the fix
  )
  ON CONFLICT (id) DO UPDATE SET
    line_number     = EXCLUDED.line_number,
    amount          = EXCLUDED.amount,
    item_type       = EXCLUDED.item_type,
    salary_amount   = EXCLUDED.salary_amount,
    expended_rate   = EXCLUDED.expended_rate,
    description     = EXCLUDED.description;   -- ← the fix
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── VERIFICATION ────────────────────────────────────────────────────────
-- Run all three queries after the migration. All three must show 0.
--
-- ### Q1: any mirror line still missing its description? ###
--   SELECT COUNT(*) AS missing_descriptions
--     FROM recoverable_invoice_lines rl
--     INNER JOIN recoverable_invoices ri ON ri.id = rl.invoice_id
--    WHERE ri.invoice_type = 'reimbursement'
--      AND rl.description IS NULL;
--
-- ### Q2: for every mirror line, description must match its source. ###
--   SELECT COUNT(*) AS mismatched_descriptions
--     FROM recoverable_invoice_lines rl
--     INNER JOIN contrast_invoice_items cii ON cii.id = rl.id
--    WHERE COALESCE(rl.description, '') <> COALESCE(cii.description, '');
--
-- ### Q3: parent invariant unchanged (paranoia) ###
--   SELECT
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)                                     AS contrast_total,
--     (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='reimbursement') AS mirror_total,
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)
--       + (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice') AS true_business_total;
--   -- true_business_total must equal the Deploy 1 fingerprint.
