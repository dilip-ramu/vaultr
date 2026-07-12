-- ── Migration v99: the rest of the asset sale ───────────────────────────────
--
-- v81 gave an asset a `sold_price` and a `sold_date`. That records that a sale
-- HAPPENED; it records nothing about the money. A sale isn't finished when you
-- agree a price — it's finished when the cash lands in an account, net of
-- whatever the bank and the taxman took on the way.
--
-- So a sale now has two stages:
--   sold  + awaiting  → price agreed, money not in yet. No transaction exists.
--   sold  + received  → money credited to an account. A real income transaction
--                       exists, and sale_transaction_id points at it.
--
-- Money model (deliberate): the transaction we create is for the NET amount —
-- what actually hits the bank statement — so it reconciles against the real bank
-- line. Charges and tax live on the asset and are subtracted in the realised
-- gain. Booking gross income plus two expenses would net to the same balance but
-- would invent bank lines that don't exist, which makes reconciliation lie.
--
-- Fully additive. Assets already marked sold under v81 keep working: they simply
-- have no charges, no tax, and a payment status of 'received' is NOT assumed —
-- they're left as 'awaiting' so you can settle them properly.

ALTER TABLE assets
  -- What was deducted before the money arrived.
  ADD COLUMN IF NOT EXISTS sale_charges  NUMERIC NOT NULL DEFAULT 0,   -- bank / brokerage / platform fees
  ADD COLUMN IF NOT EXISTS sale_tax      NUMERIC NOT NULL DEFAULT 0,   -- TDS / capital gains withheld at source
  -- What actually landed. Stored, not derived, so a rounding or a
  -- part-settlement can be corrected without rewriting the arithmetic.
  ADD COLUMN IF NOT EXISTS sale_net      NUMERIC,

  -- Where it landed, and the transaction that credits it.
  ADD COLUMN IF NOT EXISTS sale_account_id     UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  -- Settlement state.
  ADD COLUMN IF NOT EXISTS sale_payment_status TEXT NOT NULL DEFAULT 'awaiting'
    CHECK (sale_payment_status IN ('awaiting', 'received')),
  ADD COLUMN IF NOT EXISTS sale_received_date  DATE,

  -- Who bought it, and any reference (cheque no., UTR, contract note).
  ADD COLUMN IF NOT EXISTS sale_buyer     TEXT,
  ADD COLUMN IF NOT EXISTS sale_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_sale_status
  ON assets(user_id, status, sale_payment_status);

-- Backfill: an asset already marked sold has its price as the gross, and until
-- the user settles it we know nothing about where the money went.
UPDATE assets
   SET sale_net = sold_price
 WHERE status = 'sold' AND sale_net IS NULL AND sold_price IS NOT NULL;
