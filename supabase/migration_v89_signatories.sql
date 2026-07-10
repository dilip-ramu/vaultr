-- ── Migration v89: Authorised signatories ────────────────────────────────────
-- Adds a per-company list of authorised signatories (proprietor / partners),
-- each with an optional signature image (stored in the PUBLIC vaultr-avatars
-- bucket at <user_id>/signatories/<signatory_id>.<ext>). Documents then carry a
-- `signatory_id` so the chosen person's signature renders on the PDF.
--
-- Fully additive & revertible: no existing column is changed; every new column
-- is nullable with a safe default. To revert, drop the new table/columns.

-- 1. Business type on companies (proprietorship | partnership) ----------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'proprietorship';

DO $$ BEGIN
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_business_type_check;
  ALTER TABLE companies ADD CONSTRAINT companies_business_type_check
    CHECK (business_type IN ('proprietorship', 'partnership'));
EXCEPTION WHEN others THEN NULL; END $$;

-- 2. company_signatories ------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_signatories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  designation    TEXT,
  -- Path inside the PUBLIC 'vaultr-avatars' bucket, resolve via getPublicUrl.
  signature_path TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_signatories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_signatories_all" ON company_signatories;
CREATE POLICY "company_signatories_all" ON company_signatories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON company_signatories TO authenticated;

CREATE INDEX IF NOT EXISTS idx_signatories_company ON company_signatories(company_id);
-- At most one default signatory per company.
DROP INDEX IF EXISTS uq_signatory_one_default;
CREATE UNIQUE INDEX uq_signatory_one_default
  ON company_signatories(company_id) WHERE is_default = true;

-- 3. signatory_id on each document carrier -----------------------------------
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS signatory_id UUID REFERENCES company_signatories(id) ON DELETE SET NULL;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS signatory_id UUID REFERENCES company_signatories(id) ON DELETE SET NULL;
ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS signatory_id UUID REFERENCES company_signatories(id) ON DELETE SET NULL;

-- 4. Widen doc_type checks to include debit_note (supplier debit note) --------
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
-- (documents table historically has no doc_type check; add none — free text.)

ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_doc_type_check;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_doc_type_check
  CHECK (doc_type IN ('gst_invoice','reimbursable_invoice','salary_slip','credit_note','proforma_gst','purchase_order','delivery_challan','debit_note'));

ALTER TABLE document_template_assignments DROP CONSTRAINT IF EXISTS document_template_assignments_doc_type_check;
ALTER TABLE document_template_assignments ADD CONSTRAINT document_template_assignments_doc_type_check
  CHECK (doc_type IN ('gst_invoice','reimbursable_invoice','salary_slip','credit_note','proforma_gst','purchase_order','delivery_challan','debit_note'));
