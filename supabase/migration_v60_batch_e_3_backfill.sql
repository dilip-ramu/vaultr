-- ── Migration v60: Batch E · Deploy 3 — historical backfill ────────────────
-- Copies every existing contrast_invoices row (and its items) into
-- recoverable_invoices/lines with invoice_type='reimbursement'. Reconstructs
-- paid_amount / balance_due / paid_at from linked transactions instead of
-- defaulting to 'unpaid' — the trigger from Deploy 2 doesn't have this
-- history-aware logic, so the backfill does it in one pass here.
--
-- ── STOP AND READ BEFORE RUNNING ────────────────────────────────────────
-- 1. Have you taken a fresh Supabase backup? (Dashboard → Database → Backups
--    → Create backup). This migration touches thousands of rows — restoring
--    from backup is the rollback plan.
-- 2. Run the invariant-check query (bottom of file) BEFORE running this
--    migration. Screenshot the result. Compare after.
-- 3. Deploy 2's dual-write trigger stays active during the backfill. The
--    backfill only INSERTs into recoverable_invoices — not contrast_invoices —
--    so the trigger doesn't fire for backfill rows. No double-mirroring.
--
-- ── What this migration does ─────────────────────────────────────────────
-- • Bulk-inserts one mirror row per existing contrast_invoice into
--   recoverable_invoices (invoice_type='reimbursement').
-- • Reconstructs paid_amount, balance_due, paid_at from
--   transactions where transactions.contrast_invoice_id = contrast_invoices.id
--   and transactions.type = 'income'.
-- • Bulk-inserts mirror lines. ON CONFLICT DO NOTHING skips any mirror rows
--   already created by the Deploy 2 trigger since it shipped.
-- • Idempotent: safe to re-run. Re-running refreshes paid_amount/balance_due
--   from the current transactions state (useful if a payment happened between
--   backup and migration).

BEGIN;

-- ── 1. Backfill contrast_invoices → recoverable_invoices ─────────────────

INSERT INTO recoverable_invoices (
  id, user_id, invoice_number, invoice_type, invoice_month,
  customer_id, customer_name, customer_address, customer_gstin, customer_state,
  invoice_date, due_date, payment_terms, markup_type, markup_value,
  subtotal, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
  total, paid_amount, balance_due,
  status, sent_at, paid_at,
  currency, notes, pdf_path,
  created_at, updated_at
)
SELECT
  ci.id,
  ci.user_id,
  ci.invoice_number,
  'reimbursement',
  ci.invoice_month,
  ci.customer_id,
  -- Customer details snapshot: prefer the linked customer row (post-v47).
  -- For legacy rows with customer_id=NULL, fall back to the "Contrast"
  -- customer for this user (matched by name — ilike '%contrast%'), else the
  -- literal string 'Contrast' so the row is still legible.
  COALESCE(c.name, legacy_c.name, 'Contrast'),
  COALESCE(c.address, legacy_c.address),
  COALESCE(c.gst_number, legacy_c.gst_number),
  COALESCE(c.state, legacy_c.state),
  ci.invoice_date,
  NULL,                        -- no due_date — reimbursements settled ad-hoc
  'due_on_receipt',            -- default; not meaningful for reimbursements
  'none', 0,                   -- markup_type / markup_value — n/a
  ci.subtotal,
  0, COALESCE(ci.gst_amount, 0), 0, 0,   -- put any gst_amount into cgst_amount (keeps SUM(total) exact)
  ci.total,
  -- Reconstructed payment state: SUM of linked income transactions.
  COALESCE(paid_calc.paid, 0),
  ci.total - COALESCE(paid_calc.paid, 0),
  ci.status,
  -- Finalized invoices are "sent" — surface finalized_at as sent_at.
  CASE WHEN ci.status = 'finalized' THEN ci.finalized_at ELSE NULL END,
  -- paid_at = date of the newest linked payment IF the invoice is fully
  -- settled. Partial payments leave paid_at NULL, matching how
  -- recoverable_invoices tracks it (draft/sent until fully paid).
  CASE
    WHEN COALESCE(paid_calc.paid, 0) >= ci.total THEN paid_calc.paid_at
    ELSE NULL
  END,
  COALESCE(c.billing_currency, legacy_c.billing_currency, 'EUR'),
  ci.notes,
  NULL,
  ci.created_at,
  NOW()
FROM contrast_invoices ci
LEFT JOIN customers c
       ON c.id      = ci.customer_id
      AND c.user_id = ci.user_id
LEFT JOIN LATERAL (
  SELECT id, name, address, gst_number, state, billing_currency
    FROM customers
   WHERE user_id = ci.user_id
     AND name ILIKE '%contrast%'
   LIMIT 1
) legacy_c ON ci.customer_id IS NULL
LEFT JOIN LATERAL (
  SELECT
    SUM(t.amount)              AS paid,
    MAX(t.date)::TIMESTAMPTZ   AS paid_at
    FROM transactions t
   WHERE t.contrast_invoice_id = ci.id
     AND t.user_id             = ci.user_id
     AND t.type                = 'income'
) paid_calc ON TRUE
ON CONFLICT (id) DO UPDATE SET
  -- Idempotent path: keep existing invoice-level snapshot but re-sync
  -- payment state (payments may have happened since the last run).
  paid_amount = EXCLUDED.paid_amount,
  balance_due = EXCLUDED.balance_due,
  paid_at     = EXCLUDED.paid_at,
  currency    = EXCLUDED.currency,
  status      = EXCLUDED.status,
  sent_at     = EXCLUDED.sent_at,
  updated_at  = NOW();

-- ── 2. Backfill contrast_invoice_items → recoverable_invoice_lines ───────

INSERT INTO recoverable_invoice_lines (
  id, user_id, invoice_id, allocation_id, line_number,
  awb, shipment_date, hsn_sac, qty, base_rate, rate, amount,
  cgst_rate, cgst_amount, sgst_rate, sgst_amount, created_at,
  item_type, salary_amount, salary_currency, expended_rate
)
SELECT
  cii.id,
  ci.user_id,
  cii.invoice_id,
  NULL,
  cii.sort_order,
  '',           -- awb: sentinel empty — reimbursement lines have none
  NULL,
  '996812',     -- default HSN
  1, 0, 0,
  cii.amount_inr,
  0, 0, 0, 0,
  NOW(),
  cii.item_type,
  cii.salary_amount,
  'EUR',        -- historically EUR; multi-currency salary support is later
  cii.expended_rate
FROM contrast_invoice_items cii
INNER JOIN contrast_invoices ci ON ci.id = cii.invoice_id
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Ensure PostgREST picks up any new data.
NOTIFY pgrst, 'reload schema';

-- ── VERIFICATION — run all four queries after the migration ──────────────
--
-- ### Q1: invariant still holds (true_business_total unchanged) ###
--
--   SELECT
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)                                       AS contrast_total,
--     (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice')  AS tax_only_total,
--     (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='reimbursement') AS mirror_total,
--     (SELECT COALESCE(SUM(total),0) FROM contrast_invoices)
--       + (SELECT COALESCE(SUM(total),0) FROM recoverable_invoices WHERE invoice_type='tax_invoice') AS true_business_total;
--
-- • true_business_total: MUST match Deploy 1 fingerprint. If not — stop.
-- • mirror_total: MUST equal contrast_total exactly. Every Contrast invoice
--   now has a mirror. If not equal — one or more didn't backfill; check the
--   diagnostic below.
--
-- ### Q2: row-count parity ###
--
--   SELECT
--     (SELECT COUNT(*) FROM contrast_invoices)                                       AS contrast_rows,
--     (SELECT COUNT(*) FROM recoverable_invoices WHERE invoice_type='reimbursement') AS mirror_rows,
--     (SELECT COUNT(*) FROM contrast_invoice_items)                                  AS contrast_lines,
--     (SELECT COUNT(*) FROM recoverable_invoice_lines rl
--        INNER JOIN recoverable_invoices ri ON ri.id = rl.invoice_id
--       WHERE ri.invoice_type = 'reimbursement')                                     AS mirror_lines;
--
-- • contrast_rows MUST equal mirror_rows.
-- • contrast_lines MUST equal mirror_lines.
--
-- ### Q3: any missing mirrors? (should return 0 rows) ###
--
--   SELECT ci.id, ci.invoice_number, ci.invoice_month, ci.total
--   FROM contrast_invoices ci
--   LEFT JOIN recoverable_invoices ri ON ri.id = ci.id AND ri.invoice_type='reimbursement'
--   WHERE ri.id IS NULL;
--
-- ### Q4: payment-state sanity — SUM(paid) matches on both sides ###
--
--   SELECT
--     (SELECT COALESCE(SUM(paid_amount),0) FROM recoverable_invoices WHERE invoice_type='reimbursement') AS mirror_paid,
--     (SELECT COALESCE(SUM(t.amount),0)
--        FROM transactions t
--        INNER JOIN contrast_invoices ci ON ci.id = t.contrast_invoice_id
--       WHERE t.type = 'income')                                                                        AS linked_income;
--
-- • mirror_paid MUST equal linked_income (any drift means paid_amount
--   reconstruction has a bug). If they differ by more than a rounding paisa,
--   stop and report.
