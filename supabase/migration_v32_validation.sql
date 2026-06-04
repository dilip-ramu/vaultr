-- ── Migration v32: sanity CHECK constraints (the database-level gatekeeper) ──
-- Rejects only certainly-wrong data: dates outside 1900–2100 and negative
-- amounts. Legitimate historical dates (2018, 2005, …) are unaffected.
--
-- NOT VALID = applies to NEW writes only; existing rows are not checked, so
-- this migration can never fail on old data. (You can clean up old rows later
-- and run VALIDATE CONSTRAINT if you want them checked too.)

-- transactions
ALTER TABLE transactions ADD CONSTRAINT chk_txn_date_sane
  CHECK (date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE transactions ADD CONSTRAINT chk_txn_amount_nonneg
  CHECK (amount >= 0) NOT VALID;

-- bills
ALTER TABLE bills ADD CONSTRAINT chk_bills_due_date_sane
  CHECK (due_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE bills ADD CONSTRAINT chk_bills_amount_nonneg
  CHECK (amount >= 0) NOT VALID;

-- supplier_invoices
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_si_invoice_date_sane
  CHECK (invoice_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_si_due_date_sane
  CHECK (due_date IS NULL OR due_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_si_amount_nonneg
  CHECK (amount >= 0) NOT VALID;

-- recoverable_invoices (customer invoices)
ALTER TABLE recoverable_invoices ADD CONSTRAINT chk_ri_invoice_date_sane
  CHECK (invoice_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE recoverable_invoices ADD CONSTRAINT chk_ri_due_date_sane
  CHECK (due_date IS NULL OR due_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;

-- commission
ALTER TABLE commission_orders ADD CONSTRAINT chk_co_order_date_sane
  CHECK (order_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
ALTER TABLE commission_styles ADD CONSTRAINT chk_cs_expected_payment_sane
  CHECK (expected_payment_date IS NULL OR expected_payment_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;

-- payroll
ALTER TABLE payroll_months ADD CONSTRAINT chk_pm_payment_date_sane
  CHECK (payment_date IS NULL OR payment_date BETWEEN '1900-01-01' AND '2100-12-31') NOT VALID;
