-- ── Migration v66: employees.company_id ──────────────────────────────────
-- Adds the "which company does this employee work for" link. Nullable —
-- NULL semantically means "Personal" (not attached to any business), which
-- keeps us from having to create a synthetic "Personal" company entity.
--
-- Distinct from employees.works_for_customer_id (v46) — that column says
-- "this employee's salary gets reimbursed by customer X" (for the
-- Reimbursables billing flow). Both can coexist on one row:
--   • company_id            = who employs them
--   • works_for_customer_id = who reimburses their salary (optional)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_id
  ON employees(user_id, company_id);

NOTIFY pgrst, 'reload schema';
