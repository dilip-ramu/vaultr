-- ── Migration v72: job descriptions per designation ────────────────────────
-- Contracts simplified: ONE contract template per company (placeholders cover
-- everything), and the only thing that varies by designation is the job
-- description. Store JDs here, keyed by designation, with an optional
-- company override. Generation injects the matched JD into {{job_description}}.
--
-- Resolution when generating an employee's contract:
--   1. (company_id = employee's company, designation) — company-specific JD
--   2. (company_id IS NULL, designation)              — global JD for the role
--   3. none → {{job_description}} renders empty

CREATE TABLE IF NOT EXISTS job_descriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = applies to this designation across all companies (global default).
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One JD per (company, designation) per user; company_id may be NULL, so
-- COALESCE to a sentinel and lower() the designation for case-insensitive match.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_descriptions_scope
  ON job_descriptions (
    user_id,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(designation)
  );

CREATE INDEX IF NOT EXISTS idx_job_descriptions_user ON job_descriptions(user_id);

ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON job_descriptions TO authenticated;
DROP POLICY IF EXISTS "job_descriptions_all" ON job_descriptions;
CREATE POLICY "job_descriptions_all" ON job_descriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Contract templates become company-wide: designation may now be blank ('').
-- (The unique index from v70 already handles an empty designation fine.)

NOTIFY pgrst, 'reload schema';
