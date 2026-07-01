-- ── Migration v61: Batch E · Deploy 5 — update PI numbering RPC ──────────────
-- claim_contrast_invoice_number(p_month) previously took MAX(seq) FROM
-- contrast_invoices only. Now that new reimbursement invoices go to
-- recoverable_invoices (invoice_type='reimbursement'), the RPC has to look at
-- BOTH tables so numbering keeps monotonically increasing across the cutover.
--
-- The unique-index (recoverable_invoices.user_id, invoice_number) already
-- prevents a duplicate PI number from landing there. Without this RPC update
-- users would hit that unique-violation on every new reimbursement invoice.
--
-- Idempotent: CREATE OR REPLACE. Backward compatible — the function signature
-- and return shape are unchanged.

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

  -- Take MAX across BOTH tables — old Contrast invoices AND new
  -- reimbursement rows in recoverable_invoices. Ignores tax invoices
  -- (invoice_type='tax_invoice') which use a different numbering scheme.
  SELECT COALESCE(MAX(seq), 0) + 1
  INTO next_seq
  FROM (
    SELECT (regexp_match(invoice_number, '-(\d+)$'))[1]::int AS seq
      FROM contrast_invoices
     WHERE user_id = auth.uid()
    UNION ALL
    SELECT (regexp_match(invoice_number, '-(\d+)$'))[1]::int AS seq
      FROM recoverable_invoices
     WHERE user_id = auth.uid()
       AND invoice_type = 'reimbursement'
  ) all_seqs;

  RETURN 'PI-' || replace(p_month, '-', '') || '-' || LPAD(next_seq::text, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION claim_contrast_invoice_number(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
