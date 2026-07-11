-- ── Migration v97: terms & conditions per document type ─────────────────────
--
-- Terms differ by document, not by company: a quotation's validity clause has
-- nothing to do with a purchase order's acceptance clause. So terms are stored
-- per format, for the user, with an OPTIONAL company_id for later — leave it
-- NULL and the terms apply to every company (which is what we want today).
--
-- Resolution order at print time:
--   1. document_terms for (format, this company)   ← future, per-company override
--   2. document_terms for (format, NULL)           ← what this page writes
--   3. companies.terms_conditions                  ← legacy fallback, untouched
--
-- Fully additive. Nothing reads or writes companies.terms_conditions differently.

CREATE TABLE IF NOT EXISTS document_terms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format     TEXT NOT NULL,                 -- tax_invoice | proforma_gst | purchase_order | …
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,   -- NULL = all companies
  terms      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (user, format, company). Two partial indexes because NULL never
-- equals NULL in a normal unique constraint, so the global row needs its own.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_terms_company
  ON document_terms(user_id, format, company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_terms_global
  ON document_terms(user_id, format) WHERE company_id IS NULL;

ALTER TABLE document_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_terms_all" ON document_terms;
CREATE POLICY "document_terms_all" ON document_terms FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON document_terms TO authenticated;
