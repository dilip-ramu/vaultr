-- ── Migration v47: Contrast tables → multi-customer ─────────────────────────
-- contrast_invoices and contrast_billing_categories were scoped per-user but
-- assumed a single customer (Contrast). Add customer_id so the same tables
-- back any number of reimbursing customers. Backfill existing rows to the
-- user's "Contrast" customer if one exists.

ALTER TABLE contrast_invoices
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE contrast_billing_categories
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ci_user_customer  ON contrast_invoices(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cbc_user_customer ON contrast_billing_categories(user_id, customer_id);

-- Backfill — for every user with a Contrast customer, link any existing
-- contrast invoice / billing category rows to that customer. Re-runnable.
UPDATE contrast_invoices i
   SET customer_id = c.id
  FROM customers c
 WHERE i.customer_id IS NULL
   AND i.user_id = c.user_id
   AND c.name ILIKE '%contrast%';

UPDATE contrast_billing_categories bc
   SET customer_id = c.id
  FROM customers c
 WHERE bc.customer_id IS NULL
   AND bc.user_id = c.user_id
   AND c.name ILIKE '%contrast%';
