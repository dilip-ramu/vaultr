-- ── Migration v98: GST returns (GSTR-1 / GSTR-3B) ───────────────────────────
--
-- Outward supplies are already fully derivable: recoverable_invoices, documents
-- (credit/debit notes) and contrast_invoices all carry taxable value, tax and
-- the counterparty's GSTIN. Nothing to add there.
--
-- Inward supplies are not. supplier_invoices stores a single `amount` with no
-- tax breakup, so input tax credit cannot be derived from it. These columns fix
-- that. Every one is OPTIONAL with a zero/NULL default, so:
--   • existing bills keep working untouched (they simply claim no ITC),
--   • nothing in the supplier bundling / recoverable / billing logic changes,
--   • ITC starts flowing the moment a bill is filled in.

ALTER TABLE supplier_invoices
  -- Tax breakup. taxable_value + the three tax columns should sum to `amount`.
  ADD COLUMN IF NOT EXISTS taxable_value  DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS gst_rate       DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS igst_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Who supplied it, and to which of my companies (ITC belongs to one GSTIN).
  ADD COLUMN IF NOT EXISTS supplier_gstin TEXT,
  ADD COLUMN IF NOT EXISTS company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  -- Claim controls.
  ADD COLUMN IF NOT EXISTS itc_eligible   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN NOT NULL DEFAULT FALSE,
  -- HSN/SAC for the purchase register.
  ADD COLUMN IF NOT EXISTS hsn_sac        TEXT;

-- Returns are pulled per company per month — index the way we query.
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_gst
  ON supplier_invoices(user_id, company_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_recoverable_invoices_gst
  ON recoverable_invoices(user_id, company_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_documents_gst
  ON documents(user_id, company_id, doc_type, date);
