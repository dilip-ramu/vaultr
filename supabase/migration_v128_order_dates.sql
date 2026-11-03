-- ─────────────────────────────────────────────────────────────────────────────
-- v128 — Cut-off date and ETD belong to the order
--
-- v125 put them on the purchase order, which is where they are PRINTED. But
-- they are decided earlier than that — when the job is planned — and they are
-- the two dates the whole order is chased against. Keeping them only on the
-- purchase order meant an order had no dates at all until a PO existed, and
-- an order bought from two suppliers had two sets of them and no answer to
-- "when does this ship".
--
-- So the order holds them, and the purchase order is filled in from the order.
-- The documents.cutoff_date / documents.etd columns stay exactly as they are:
-- what is printed on a given purchase order should not silently change
-- because somebody moved a date on the order afterwards.
--
-- ROLLBACK
--   ALTER TABLE orders DROP COLUMN IF EXISTS cutoff_date;
--   ALTER TABLE orders DROP COLUMN IF EXISTS etd;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cutoff_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS etd date;

COMMENT ON COLUMN orders.cutoff_date IS 'Last date this order can still be accepted or changed.';
COMMENT ON COLUMN orders.etd IS 'Estimated date of despatch for the order.';

CREATE INDEX IF NOT EXISTS orders_etd_idx ON orders(user_id, etd) WHERE etd IS NOT NULL;

NOTIFY pgrst, 'reload schema';
