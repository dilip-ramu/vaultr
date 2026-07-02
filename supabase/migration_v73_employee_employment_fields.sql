-- ── Migration v73: employee reporting manager + place of employment ─────────
-- New employee fields, editable on the Employees page and available as
-- contract placeholders: {{employee.reporting_manager}},
-- {{employee.employment_country}}, {{employee.employment_city}}.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS reporting_manager  TEXT,
  ADD COLUMN IF NOT EXISTS employment_country TEXT,
  ADD COLUMN IF NOT EXISTS employment_city    TEXT;

NOTIFY pgrst, 'reload schema';
