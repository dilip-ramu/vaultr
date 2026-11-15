-- ─────────────────────────────────────────────────────────────────────────────
-- v130 — Money moving on an order
--
-- An advance to a supplier is not a note on a page: it is rupees leaving a
-- bank account. So every payment recorded against an order posts a REAL
-- transaction, and from that moment it is in the balances, the Books and the
-- net worth like any other rupee. Chit already works this way; this is the
-- order side of the same idea.
--
-- `transaction_id` is the link, and it is what makes deleting honest: remove
-- the advance and the exact entry it created goes with it. Nothing else is
-- touched, because nothing else is named.
--
-- ON DELETE SET NULL rather than CASCADE on that link, deliberately. If a
-- transaction is deleted from the Transactions page, the payment row must
-- survive with a visible gap rather than silently vanishing from the order —
-- a missing advance is a question somebody has to be able to ask.
--
-- The DIRECTION is not stored. It is derived from `kind` in
-- lib/orders/payments.ts, because two fields that have to agree are two
-- fields that eventually will not, and the one that would be wrong is the
-- one deciding whether the balance goes up or down.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS order_payments;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which side of the order. An order has money moving BOTH ways: out to
  -- the supplier and in from the customer. Same three kinds on each side,
  -- so the party decides the direction rather than there being six kinds.
  -- Also added by the ALTER below, for a table created before this column
  -- existed. Both paths have to be here or one of them is broken.
  party          text NOT NULL DEFAULT 'supplier',
  kind           text NOT NULL CHECK (kind IN ('advance','settlement','refund')),
  amount         numeric NOT NULL CHECK (amount > 0),
  paid_date      date NOT NULL DEFAULT CURRENT_DATE,

  account_id     uuid REFERENCES accounts(id) ON DELETE SET NULL,
  supplier_id    uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  party_name     text,

  reference      text,
  note           text,

  -- The bank entry this payment created. Deleting the payment deletes it.
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,

  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN order_payments.transaction_id IS
  'The bank entry this payment posted. Removing the payment removes that entry and nothing else.';

-- ── Re-runnable ─────────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS does nothing when the table is already there, so
-- columns added to its body after the first run never appear. `party` and
-- `customer_id` arrived in a later pass; these put them on a table that was
-- created before they existed, and do nothing on a fresh one.
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS party text NOT NULL DEFAULT 'supplier';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- The CHECK belongs to the table, not the column, so it is not covered by
-- ADD COLUMN IF NOT EXISTS and has to be added on its own terms.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_payments'::regclass AND conname = 'order_payments_party_check'
  ) THEN
    ALTER TABLE order_payments
      ADD CONSTRAINT order_payments_party_check CHECK (party IN ('supplier','customer'));
  END IF;
END $$;

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_payments_all ON order_payments;
CREATE POLICY order_payments_all ON order_payments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;

-- The index changed shape when `party` arrived, and CREATE INDEX IF NOT
-- EXISTS keeps the old one rather than replacing it. Dropped by name first.
DROP INDEX IF EXISTS order_payments_order_idx;
CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments(order_id, party, paid_date DESC);
CREATE INDEX IF NOT EXISTS order_payments_txn_idx   ON order_payments(transaction_id) WHERE transaction_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
