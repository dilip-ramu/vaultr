-- ── Migration v20: Link recoverable invoices to Contrast invoices ─────────────
-- Courier charges to Contrast Company A/S are tracked in recoverable_invoices.
-- This column links each recoverable invoice to the contrast proforma that billed it.

ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS contrast_invoice_id UUID
    REFERENCES contrast_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ri_contrast_invoice
  ON recoverable_invoices(user_id, contrast_invoice_id);
