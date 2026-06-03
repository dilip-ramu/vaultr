-- migration_v27: link transactions to supplier invoices (for mark-unpaid support)
-- Also makes supplier_id optional for personal bills

-- 1. Make supplier_id nullable so personal bills (Netflix, Spotify, etc.) don't need a supplier
ALTER TABLE supplier_invoices
  ALTER COLUMN supplier_id DROP NOT NULL;

-- 2. Add payee_name for personal bills (displayed when supplier_id IS NULL)
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS payee_name TEXT;

-- 3. Add is_personal_bill flag to distinguish personal vs supplier invoices in UI
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS is_personal_bill BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Add supplier_invoice_id to transactions so mark-unpaid can find & delete the transaction
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL;

-- 5. Add supplier_payment_batch_id to transactions for bulk payment batches
--    When multiple invoices are paid together, the single transaction links via batch
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS supplier_payment_batch_id UUID REFERENCES bulk_payment_batches(id) ON DELETE SET NULL;

-- Indexes for efficient lookup during mark-unpaid
CREATE INDEX IF NOT EXISTS idx_txn_supplier_invoice
  ON transactions(supplier_invoice_id)
  WHERE supplier_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_txn_supplier_batch
  ON transactions(supplier_payment_batch_id)
  WHERE supplier_payment_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_personal
  ON supplier_invoices(user_id, is_personal_bill);
