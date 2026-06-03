-- Migration v26: Add recurring support to supplier_invoices
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS is_recurring      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS recurrence_interval TEXT
  CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly'));
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
