-- ── Migration v71: customisable document templates (library + assignment) ───
-- The block-based template engine. A template is a JSON schema (theme + ordered
-- blocks) stored in document_templates. Companies assign a template per
-- document type via document_template_assignments. When no assignment exists,
-- the app keeps rendering the existing built-in layout — nothing changes until
-- the user creates and assigns a custom template.

CREATE TABLE IF NOT EXISTS document_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type   TEXT NOT NULL CHECK (doc_type IN ('gst_invoice','reimbursable_invoice','salary_slip')),
  name       TEXT NOT NULL,
  schema     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_templates_user ON document_templates(user_id, doc_type, updated_at DESC);

-- Assignment: which template a company uses for a doc type. NULL company_id =
-- the "Personal / default" assignment used when an invoice has no company.
CREATE TABLE IF NOT EXISTS document_template_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('gst_invoice','reimbursable_invoice','salary_slip')),
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One assignment per (company, doc_type). company_id may be NULL, so COALESCE
-- to a sentinel for the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dta_scope
  ON document_template_assignments (
    user_id,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    doc_type
  );

ALTER TABLE document_templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template_assignments ENABLE ROW LEVEL SECURITY;

GRANT ALL ON document_templates            TO authenticated;
GRANT ALL ON document_template_assignments TO authenticated;

DROP POLICY IF EXISTS "document_templates_all" ON document_templates;
CREATE POLICY "document_templates_all" ON document_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dta_all" ON document_template_assignments;
CREATE POLICY "dta_all" ON document_template_assignments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
