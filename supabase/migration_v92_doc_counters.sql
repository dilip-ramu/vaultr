-- ── Migration v92: monotonic document numbers ───────────────────────────────
-- Document numbers must never be reused, even after a document is deleted.
-- A per (user, company, type-code, year) counter holds the high-water mark and
-- only ever increases. next_document_number() returns the next value, seeding
-- from any existing documents the first time so legacy numbers aren't reused.

CREATE TABLE IF NOT EXISTS document_counters (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  code       TEXT NOT NULL,
  yy         TEXT NOT NULL,
  last_seq   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, company_id, code, yy)
);

ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_counters_all" ON document_counters;
CREATE POLICY "document_counters_all" ON document_counters FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON document_counters TO authenticated;

-- Atomically reserve the next sequence for a company + type code + year.
-- Seeds from the max existing document number so it never collides with docs
-- created before this migration; the counter then only increases (deletions
-- never lower it), guaranteeing numbers are never reused.
CREATE OR REPLACE FUNCTION next_document_number(p_company UUID, p_code TEXT, p_yy TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_max INT;
  result       INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '^.*' || p_code || p_yy, ''), '')::INT), 0)
    INTO existing_max
    FROM documents
    WHERE user_id = auth.uid()
      AND company_id = p_company
      AND number ~ (p_code || p_yy || '[0-9]+$');

  INSERT INTO document_counters (user_id, company_id, code, yy, last_seq)
    VALUES (auth.uid(), p_company, p_code, p_yy, existing_max + 1)
  ON CONFLICT (user_id, company_id, code, yy)
    DO UPDATE SET last_seq = GREATEST(document_counters.last_seq, existing_max) + 1
  RETURNING last_seq INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION next_document_number(UUID, TEXT, TEXT) TO authenticated;
