-- ── Migration v74: reporting manager's designation ─────────────────────────
-- Free-text, entered on the Employees page next to the reporting manager.
-- Available as {{employee.reporting_manager_designation}} in contracts.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS reporting_manager_designation TEXT;

NOTIFY pgrst, 'reload schema';
