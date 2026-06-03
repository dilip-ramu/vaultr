-- migration_v30: auto-pay support for recurring supplier invoices
-- When auto_pay_account_id is set, the daily cron will automatically
-- create an expense transaction and mark the invoice paid on its due date.

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS auto_pay_account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skip_next_autopay    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_si_autopay
  ON supplier_invoices(auto_pay_account_id, invoice_date, is_paid)
  WHERE auto_pay_account_id IS NOT NULL AND is_recurring = TRUE AND is_paid = FALSE;
