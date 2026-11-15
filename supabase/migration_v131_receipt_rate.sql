-- ─────────────────────────────────────────────────────────────────────────────
-- v131 — What rate the money actually came in at
--
-- An export invoice is in dollars; the money arrives in rupees. The rate on
-- the contract is not the rate you got — the bank's rate is, less its
-- charges, adjusted for whatever the customer actually settled. So the rate
-- is not typed in; it is worked out from the bank advice:
--
--   rate = (remittance − bank charges) ÷ (invoice value ± adjustment)
--
-- Which side an adjustment lands on is decided by its currency. One in the
-- ORDER'S currency changes what was settled, so it goes in the denominator.
-- One in RUPEES goes in the numerator, because converting it would need the
-- very rate being calculated — see lib/orders/receipt.ts.
--
-- The INPUTS are stored, not just the answer. A rate with no workings behind
-- it is a number nobody can check against a bank advice a year later, which
-- is exactly when somebody asks.
--
-- ROLLBACK
--   ALTER TABLE order_payments
--     DROP COLUMN IF EXISTS remittance_inr, DROP COLUMN IF EXISTS bank_charges,
--     DROP COLUMN IF EXISTS invoice_fx, DROP COLUMN IF EXISTS adjustment_amount,
--     DROP COLUMN IF EXISTS adjustment_currency, DROP COLUMN IF EXISTS adjustment_sign,
--     DROP COLUMN IF EXISTS adjustment_reason, DROP COLUMN IF EXISTS realised_rate,
--     DROP COLUMN IF EXISTS settled_fx;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS remittance_inr      numeric;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS bank_charges        numeric NOT NULL DEFAULT 0;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS invoice_fx          numeric;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS adjustment_amount   numeric NOT NULL DEFAULT 0;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS adjustment_currency text;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS adjustment_sign     text;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS adjustment_reason   text;
-- Worked out, not typed. Stored so the P/L does not recompute it from rows
-- that may since have been edited.
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS realised_rate       numeric;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS settled_fx          numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_payments'::regclass AND conname = 'order_payments_adj_currency_check'
  ) THEN
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_adj_currency_check
      CHECK (adjustment_currency IS NULL OR adjustment_currency IN ('fx','inr'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_payments'::regclass AND conname = 'order_payments_adj_sign_check'
  ) THEN
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_adj_sign_check
      CHECK (adjustment_sign IS NULL OR adjustment_sign IN ('add','deduct'));
  END IF;
END $$;

COMMENT ON COLUMN order_payments.remittance_inr IS
  'Rupees remitted, BEFORE bank charges. The posted transaction is this less the charges.';
COMMENT ON COLUMN order_payments.realised_rate IS
  'Rupees that landed divided by currency that settled. Worked out, never typed.';

NOTIFY pgrst, 'reload schema';
