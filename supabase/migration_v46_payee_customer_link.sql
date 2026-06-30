-- ── Migration v46: Payee↔Customer link + employee Works-for ─────────────────
-- Generalises the hard-coded "Contrast" workflow:
--   • Each payee can optionally point at a customer. A payee with customer_id
--     set means transactions tagged with it are reimbursable by that customer.
--   • Each employee gets a "works_for_customer_id" and "exclude_from_invoicing"
--     toggle so payroll for that employee can roll into the customer's invoice.
-- The legacy single-customer "Contrast" hard-coding gets backfilled into this
-- generic model so the existing UI keeps working unchanged.

-- 1. payees.customer_id
ALTER TABLE payees ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payees_user_customer ON payees(user_id, customer_id);

-- 2. employees fields
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS works_for_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exclude_from_invoicing BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_works_for ON employees(user_id, works_for_customer_id);

-- 3. Backfill — for every user, if they have BOTH a "Contrast" payee and a
-- "Contrast" customer, link the payee → customer. Re-runnable.
UPDATE payees p
   SET customer_id = c.id
  FROM customers c
 WHERE p.user_id = c.user_id
   AND p.customer_id IS NULL
   AND p.name ILIKE '%contrast%'
   AND c.name ILIKE '%contrast%';

-- 4. Create one explicit "Me" payee per user (skip if already exists).
INSERT INTO payees (user_id, name)
SELECT u.id, 'Me'
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM payees p2
    WHERE p2.user_id = u.id AND p2.name = 'Me'
 );
