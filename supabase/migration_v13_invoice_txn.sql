-- ── Migration v13: Store transaction_id on invoice ────────────────────────
-- Allows revert to cleanly delete the associated income transaction.

ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
