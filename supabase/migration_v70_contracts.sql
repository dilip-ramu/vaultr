-- ── Migration v70: employment contract templates + generated contracts ──────
-- Feature 3. Word (.docx) templates with {{placeholders}}, scoped to a
-- (company, designation) pair, so the same role gets a different contract from
-- different companies. Rendered per-employee into a finished .docx.
--
-- Version history matters (legal docs): every uploaded template file is kept
-- as a row in contract_template_versions (never overwritten), and every
-- generated contract is archived in generated_contracts with a snapshot of
-- the data used. Files live in the private vaultr-attachments bucket.

-- ── 1. Templates — one per (user, company, designation) ────────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL company_id = "Personal" employees (employees.company_id IS NULL).
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  designation     TEXT NOT NULL,
  name            TEXT,                       -- optional label, e.g. "Designer offer letter"
  current_version INT  NOT NULL DEFAULT 0,    -- 0 = created but no file yet
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One template per company+designation per user. company_id may be NULL, and
-- Postgres treats NULLs as distinct in a plain unique index — so COALESCE it
-- to a sentinel and lower() the designation for case-insensitive matching.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_templates_scope
  ON contract_templates (
    user_id,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(designation)
  );

CREATE INDEX IF NOT EXISTS idx_contract_templates_user ON contract_templates(user_id);

-- ── 2. Template versions — every uploaded .docx, kept forever ──────────────
CREATE TABLE IF NOT EXISTS contract_template_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  file_path   TEXT NOT NULL,                  -- vaultr-attachments path
  file_name   TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ctv_template ON contract_template_versions(template_id, version DESC);

-- ── 3. Generated contracts — issued-document archive ───────────────────────
CREATE TABLE IF NOT EXISTS generated_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  template_id      UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  template_version INT,
  file_path        TEXT NOT NULL,             -- vaultr-attachments path
  file_name        TEXT,
  -- Snapshots so the record survives even if the employee/template changes.
  employee_name    TEXT,
  designation      TEXT,
  data_snapshot    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_contracts_emp ON generated_contracts(user_id, employee_id, created_at DESC);

-- ── RLS + grants ───────────────────────────────────────────────────────────
ALTER TABLE contract_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_template_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_contracts         ENABLE ROW LEVEL SECURITY;

GRANT ALL ON contract_templates         TO authenticated;
GRANT ALL ON contract_template_versions TO authenticated;
GRANT ALL ON generated_contracts        TO authenticated;

DROP POLICY IF EXISTS "contract_templates_all" ON contract_templates;
CREATE POLICY "contract_templates_all" ON contract_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contract_template_versions_all" ON contract_template_versions;
CREATE POLICY "contract_template_versions_all" ON contract_template_versions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "generated_contracts_all" ON generated_contracts;
CREATE POLICY "generated_contracts_all" ON generated_contracts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
