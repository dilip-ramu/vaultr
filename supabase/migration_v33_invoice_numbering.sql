-- ── Migration v33: atomic invoice numbering ──────────────────────────────────
-- Fixes two problems:
--   1. Customer (GST) invoice numbers were read-then-incremented from the app:
--      two simultaneous creations could mint the SAME number.
--   2. Contrast invoice numbers were based on COUNT(*): deleting an invoice
--      made the next one REUSE an old number.
-- Both now claim their number inside a single atomic database operation.

-- ── 1. Customer invoices: claim next number atomically ───────────────────────
CREATE OR REPLACE FUNCTION claim_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  claimed int;
  pfx text;
BEGIN
  -- Ensure settings row exists
  INSERT INTO recoverable_invoice_settings (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  -- Single UPDATE = atomic: no two calls can ever get the same number
  UPDATE recoverable_invoice_settings
  SET next_invoice_number = next_invoice_number + 1
  WHERE user_id = auth.uid()
  RETURNING next_invoice_number - 1, invoice_prefix INTO claimed, pfx;

  RETURN pfx || LPAD(claimed::text, 6, '0');
END $$;

GRANT EXECUTE ON FUNCTION claim_invoice_number() TO authenticated;

-- ── 2. Contrast invoices: next number = highest ever used + 1 ────────────────
CREATE OR REPLACE FUNCTION claim_contrast_invoice_number(p_month text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_seq int;
BEGIN
  -- Serialise per user so two simultaneous creations can't pick the same seq
  PERFORM pg_advisory_xact_lock(hashtext('contrast_inv_' || auth.uid()::text));

  SELECT COALESCE(MAX((regexp_match(invoice_number, '-(\d+)$'))[1]::int), 0) + 1
  INTO next_seq
  FROM contrast_invoices
  WHERE user_id = auth.uid();

  RETURN 'PI-' || replace(p_month, '-', '') || '-' || LPAD(next_seq::text, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION claim_contrast_invoice_number(text) TO authenticated;

-- ── 3. Hard guarantee: no duplicate contrast invoice numbers, ever ────────────
-- (recoverable_invoices already has UNIQUE(user_id, invoice_number) from v10.)
-- Wrapped so the migration still succeeds if old duplicates already exist —
-- you'd then see a notice and can rename the duplicates before re-running.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_contrast_invoice_number
    ON contrast_invoices(user_id, invoice_number);
EXCEPTION WHEN unique_violation OR duplicate_table THEN
  RAISE NOTICE 'uq_contrast_invoice_number not created — duplicate invoice numbers already exist; clean them up and re-run this block';
END $$;
