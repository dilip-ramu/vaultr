-- ── Migration v101: the transaction that BOUGHT the asset ───────────────────
--
-- Selling an asset already books an income transaction and remembers it
-- (assets.sale_transaction_id). Buying one didn't: you record the expense, then
-- separately re-type the asset, and nothing joins the two. So the cost on the
-- asset can drift from the money that actually left the account, and nothing
-- tells you that this ₹4 lakh expense IS the embroidery machine.
--
-- This closes the loop: an asset can point at the expense that paid for it.
--
-- Additive and nullable — assets bought before this (or paid in cash, or gifted)
-- simply have no purchase transaction, which is a true statement about them.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS purchase_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- One transaction buys one asset. Enforced so a single expense can't be claimed
-- by two assets — that would double-count the cost in every realised-gain sum.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_purchase_txn
  ON assets(purchase_transaction_id)
  WHERE purchase_transaction_id IS NOT NULL;
