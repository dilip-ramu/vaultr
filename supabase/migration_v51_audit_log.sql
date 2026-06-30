-- ── Migration v51: append-only audit log ───────────────────────────────────
-- An audit row is written for every insert/update/delete on the high-value
-- tables (transactions, recoverable_invoices, contrast_invoices, employees,
-- payroll_entries). Use it to:
--   • Catch double-paid salaries / wrong-amount edits before they pile up.
--   • Reconstruct deleted invoices.
--   • Hold yourself accountable when something goes sideways.
--
-- Append-only. RLS so each user only sees their own rows.

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID,                              -- nullable in case triggers fire without auth
  table_name TEXT        NOT NULL,
  row_id     UUID,
  op         TEXT        NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  before     JSONB,
  after      JSONB
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_self" ON audit_log;
CREATE POLICY "audit_self" ON audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON audit_log TO authenticated;
-- Inserts come from SECURITY DEFINER triggers, no INSERT policy needed.

CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_row       ON audit_log(table_name, row_id, occurred_at DESC);

-- One generic trigger function for any table that has user_id + an id column.
CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_row_id  UUID;
  v_before  JSONB;
  v_after   JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := (row_to_json(OLD)::jsonb)->>'user_id';
    v_row_id  := ((row_to_json(OLD)::jsonb)->>'id')::uuid;
    v_before  := row_to_json(OLD)::jsonb;
    v_after   := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := (row_to_json(NEW)::jsonb)->>'user_id';
    v_row_id  := ((row_to_json(NEW)::jsonb)->>'id')::uuid;
    v_before  := row_to_json(OLD)::jsonb;
    v_after   := row_to_json(NEW)::jsonb;
  ELSE  -- INSERT
    v_user_id := (row_to_json(NEW)::jsonb)->>'user_id';
    v_row_id  := ((row_to_json(NEW)::jsonb)->>'id')::uuid;
    v_before  := NULL;
    v_after   := row_to_json(NEW)::jsonb;
  END IF;

  INSERT INTO audit_log (user_id, table_name, row_id, op, before, after)
  VALUES (v_user_id, TG_TABLE_NAME, v_row_id, TG_OP, v_before, v_after);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Attach to high-value tables. DROP+CREATE so re-running this is idempotent.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'transactions',
    'recoverable_invoices',
    'contrast_invoices',
    'employees',
    'payroll_entries',
    'payroll_months'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
      t, t
    );
  END LOOP;
END $$;
