-- ── Migration v63: per-customer fixed monthly expenses ──────────────────────
-- The reimbursement invoice builder used to hardcode a Contrast-specific list
-- of fixed expenses (Office Rent, House Keeping, Internet, Electricity, Bank
-- Charges) at the top of the client component. That's not scalable now that
-- any customer can be reimbursable — each customer has their own set.
--
-- Simplest fit: a JSONB column on customers that stores an array of
-- {description, amount} objects. Cheap to read, easy to edit inline in the
-- customer form, no separate table to maintain. Users can override each row's
-- amount on a per-invoice basis (the builder already supports that) — this
-- column just seeds the defaults for that customer's future invoices.
--
-- The stored amounts are in the customer's own billing_currency (not INR) —
-- reimbursements bundle salaries + fixed expenses in the customer's currency
-- and convert only courier/expense items at the forex rate.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS fixed_expenses JSONB;

-- Optional sanity check — every row is either NULL or a JSON array.
ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_fixed_expenses_shape;
ALTER TABLE customers
  ADD  CONSTRAINT customers_fixed_expenses_shape
  CHECK (
    fixed_expenses IS NULL
    OR jsonb_typeof(fixed_expenses) = 'array'
  );

NOTIFY pgrst, 'reload schema';
