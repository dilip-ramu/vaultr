-- ── Migration v53: rename salary_euro → salary_amount, add salary_currency ─
-- The column was misnamed: an employee's salary is "an amount in whatever
-- currency the customer they bill against uses", not necessarily EUR. The
-- rename clarifies. salary_currency is added on the employees table only —
-- payroll_entries / contrast_invoice_items inherit the currency from the
-- employee at run-time.
--
-- All three tables that store the column get the rename so JSON shapes stay
-- consistent. Re-runnable: each step is conditional.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'employees' AND column_name = 'salary_euro'
  ) THEN
    ALTER TABLE employees RENAME COLUMN salary_euro TO salary_amount;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'payroll_entries' AND column_name = 'salary_euro'
  ) THEN
    ALTER TABLE payroll_entries RENAME COLUMN salary_euro TO salary_amount;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'contrast_invoice_items' AND column_name = 'salary_euro'
  ) THEN
    ALTER TABLE contrast_invoice_items RENAME COLUMN salary_euro TO salary_amount;
  END IF;
END $$;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_currency TEXT NOT NULL DEFAULT 'EUR';
