-- ── Migration v64: SWIFT code on companies + invoice settings ──────────────
-- SWIFT is needed on foreign-currency invoices (both reimbursement and tax
-- invoices to overseas customers). The companies table already carries bank
-- account / IFSC / etc. but not SWIFT — this fills the gap.
--
-- Also add swift_code to recoverable_invoice_settings so the tax-invoice
-- print view can render it alongside the other bank rows.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS swift_code TEXT;

ALTER TABLE recoverable_invoice_settings
  ADD COLUMN IF NOT EXISTS swift_code TEXT;

NOTIFY pgrst, 'reload schema';
