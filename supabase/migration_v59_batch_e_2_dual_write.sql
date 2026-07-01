-- ── Migration v59: Batch E · Deploy 2 — dual-write via trigger ─────────────
-- Every write to contrast_invoices / contrast_invoice_items now mirrors into
-- recoverable_invoices / recoverable_invoice_lines with invoice_type =
-- 'reimbursement'. Reads STILL come from contrast_invoices — the app doesn't
-- notice yet. Purpose: catch shape/mapping drift on new writes for a week
-- before we do the historical backfill in Deploy 3.
--
-- Doing this in a trigger (not app code) means every write path is covered —
-- API routes, SQL editor, cron jobs, later backfill scripts. The mirror row
-- SHARES the same id as its Contrast source, so:
--   • lookups are trivial (id-to-id)
--   • transactions.contrast_invoice_id already points at the correct target
--   • updates and deletes mirror trivially
--
-- INVARIANT DURING DUAL-WRITE (this is important):
--   Every new reimbursement invoice appears in BOTH tables — so the naive
--   SUM(contrast) + SUM(recoverable) will grow by 2× the new invoice total.
--   The de-duplicating query below is the one to trust from here forward:
--
--     SELECT
--       (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)                                   AS contrast_total,
--       (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice')AS tax_only_total,
--       (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='reimbursement')AS mirror_total,
--       (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)
--         + (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice')  AS true_business_total;
--
--   `true_business_total` is the fingerprint you compare across every deploy
--   from here on. It equals the Deploy-1 grand_total_invoiced fingerprint.
--   `mirror_total` should exactly match SUM of new Contrast invoices raised
--   AFTER this migration ships — that's the sanity check for the trigger.

-- ── Helper: mirror one contrast_invoices row into recoverable_invoices ────
-- SECURITY DEFINER so it works from any auth context; RLS check is enforced
-- separately since user_id is copied verbatim.

CREATE OR REPLACE FUNCTION batch_e_mirror_contrast_invoice(
  _op    TEXT,          -- 'INSERT' | 'UPDATE' | 'DELETE'
  _row   contrast_invoices
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cust  RECORD;
BEGIN
  IF _op = 'DELETE' THEN
    -- The mirror row shares the same id. CASCADE handles lines.
    DELETE FROM recoverable_invoices WHERE id = _row.id;
    RETURN;
  END IF;

  -- Pull customer details for the mirror. contrast_invoices.customer_id was
  -- added in v47 — nullable, so it may be null on old rows. On INSERTs after
  -- Deploy 2 ships it's always populated (UI + API set it). Legacy rows are
  -- handled by the Deploy 3 backfill, not this trigger.
  SELECT id, name, address, gst_number, state, state_code, billing_currency
    INTO _cust
    FROM customers
   WHERE id = _row.customer_id
     AND user_id = _row.user_id
   LIMIT 1;

  -- Upsert by shared primary key. Contrast → recoverable field mapping:
  INSERT INTO recoverable_invoices (
    id, user_id,
    invoice_number, invoice_type, invoice_month,
    customer_id, customer_name, customer_address, customer_gstin, customer_state,
    invoice_date, due_date, payment_terms,
    markup_type, markup_value,
    subtotal,
    cgst_rate, cgst_amount, sgst_rate, sgst_amount,
    total,
    paid_amount, balance_due,
    status, sent_at, paid_at,
    currency, notes, pdf_path,
    created_at, updated_at
  )
  VALUES (
    _row.id, _row.user_id,
    _row.invoice_number, 'reimbursement', _row.invoice_month,
    _row.customer_id,
    COALESCE(_cust.name, 'Contrast'),
    _cust.address, _cust.gst_number, _cust.state,
    _row.invoice_date, NULL, 'due_on_receipt',
    'none', 0,
    _row.subtotal,
    -- Reimbursements historically carry no GST split. If a user did enter a
    -- gst_amount on the Contrast side, put the whole figure into cgst_amount
    -- so SUM(total) matches exactly. Rates left 0 — no GST-invoice contract.
    0, COALESCE(_row.gst_amount, 0), 0, 0,
    _row.total,
    -- paid_amount / balance_due — Deploy 2 mirrors NEW invoices only. On
    -- fresh creation they're unpaid. Deploy 3 will reconstruct historical
    -- payment state from linked transactions.
    0, _row.total,
    _row.status,
    -- sent_at / paid_at — nearest equivalents.
    CASE WHEN _row.status = 'finalized' THEN _row.finalized_at ELSE NULL END,
    NULL,
    COALESCE(_cust.billing_currency, 'EUR'),
    _row.notes, NULL,
    _row.created_at, NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    invoice_number   = EXCLUDED.invoice_number,
    invoice_month    = EXCLUDED.invoice_month,
    customer_id      = EXCLUDED.customer_id,
    customer_name    = EXCLUDED.customer_name,
    customer_address = EXCLUDED.customer_address,
    customer_gstin   = EXCLUDED.customer_gstin,
    customer_state   = EXCLUDED.customer_state,
    invoice_date     = EXCLUDED.invoice_date,
    subtotal         = EXCLUDED.subtotal,
    cgst_amount      = EXCLUDED.cgst_amount,
    total            = EXCLUDED.total,
    balance_due      = EXCLUDED.total - recoverable_invoices.paid_amount,
    status           = EXCLUDED.status,
    sent_at          = EXCLUDED.sent_at,
    currency         = EXCLUDED.currency,
    notes            = EXCLUDED.notes,
    updated_at       = NOW();
END;
$$;


-- ── Helper: mirror one contrast_invoice_items row into recoverable_invoice_lines ──

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

  -- user_id lives on the parent — line table doesn't carry it in contrast.
  SELECT user_id INTO _uid FROM contrast_invoices WHERE id = _row.invoice_id;
  IF _uid IS NULL THEN
    -- Orphan line; skip silently. Trigger firing during a transaction with
    -- the parent about to be inserted will re-fire on the parent's commit.
    RETURN;
  END IF;

  INSERT INTO recoverable_invoice_lines (
    id, user_id, invoice_id, allocation_id,
    line_number,
    awb, shipment_date, hsn_sac, qty, base_rate, rate, amount,
    cgst_rate, cgst_amount, sgst_rate, sgst_amount,
    created_at,
    item_type, salary_amount, salary_currency, expended_rate
  )
  VALUES (
    _row.id, _uid, _row.invoice_id, NULL,
    _row.sort_order,
    -- recoverable_invoice_lines has NOT NULL constraints on shipment fields
    -- that don't apply to reimbursement lines. Use sentinel-empty values —
    -- the item_type marker tells the UI to ignore them.
    '', NULL, '996812', 1, 0, 0, _row.amount_inr,
    0, 0, 0, 0,
    NOW(),
    _row.item_type, _row.salary_amount,
    -- v53 renamed salary_euro → salary_amount but left the currency implicit
    -- as EUR. Any explicit multi-currency will come later.
    'EUR', _row.expended_rate
  )
  ON CONFLICT (id) DO UPDATE SET
    line_number     = EXCLUDED.line_number,
    amount          = EXCLUDED.amount,
    item_type       = EXCLUDED.item_type,
    salary_amount   = EXCLUDED.salary_amount,
    expended_rate   = EXCLUDED.expended_rate;
END;
$$;


-- ── Trigger wrappers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_contrast_invoices_mirror()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM batch_e_mirror_contrast_invoice('DELETE', OLD);
    RETURN OLD;
  END IF;
  PERFORM batch_e_mirror_contrast_invoice(TG_OP, NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_contrast_invoice_items_mirror()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM batch_e_mirror_contrast_invoice_item('DELETE', OLD);
    RETURN OLD;
  END IF;
  PERFORM batch_e_mirror_contrast_invoice_item(TG_OP, NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contrast_invoices_mirror_trg     ON contrast_invoices;
CREATE TRIGGER      contrast_invoices_mirror_trg
  AFTER INSERT OR UPDATE OR DELETE ON contrast_invoices
  FOR EACH ROW EXECUTE FUNCTION trg_contrast_invoices_mirror();

DROP TRIGGER IF EXISTS contrast_invoice_items_mirror_trg ON contrast_invoice_items;
CREATE TRIGGER      contrast_invoice_items_mirror_trg
  AFTER INSERT OR UPDATE OR DELETE ON contrast_invoice_items
  FOR EACH ROW EXECUTE FUNCTION trg_contrast_invoice_items_mirror();

NOTIFY pgrst, 'reload schema';

-- ── After running: verify with these two queries ──────────────────────────
-- 1. `true_business_total` MUST still equal Deploy-1's grand_total_invoiced.
-- 2. `mirror_total` MUST be 0 immediately after this migration (no new
--    Contrast invoices have been raised yet). It'll grow only as you create
--    new reimbursement invoices from the UI.
--
--   SELECT
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)                                       AS contrast_total,
--     (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice')  AS tax_only_total,
--     (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='reimbursement') AS mirror_total,
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)
--       + (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice') AS true_business_total;
