-- ── Migration v75: per-document design version ────────────────────────────
-- Introduces the "Claude" invoice (16a) + salary-slip (17a) layouts WITHOUT
-- changing any document that already exists. Each invoice / slip carries the
-- design it was created under; the renderer picks the layout from this stamp.
--
--   NULL / 'legacy'  → the existing template/accent layout (unchanged)
--   'claude'         → the new 16a (invoice) / 17a (salary slip) design
--
-- Only newly created documents are stamped 'claude', so history is frozen.

-- Invoices carry their own stamp (one row per invoice).
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS design_version TEXT;

-- Salary slips are rendered on the fly from a payroll month's entries, so the
-- month is the natural unit to version: every slip in a month follows the
-- month's design. New months are stamped 'claude'; existing months stay NULL.
ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS design_version TEXT;

NOTIFY pgrst, 'reload schema';
