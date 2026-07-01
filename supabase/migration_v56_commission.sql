-- ─────────────────────────────────────────────────────────────────
-- Commission tracking migration  (two-table design)
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Flag on existing customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pays_commission boolean NOT NULL DEFAULT false;

-- 2. Order header  (one row per purchase order)
CREATE TABLE IF NOT EXISTS commission_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  account_id      uuid REFERENCES accounts(id)  ON DELETE SET NULL,
  order_number    text,
  order_date      date NOT NULL DEFAULT CURRENT_DATE,
  payment_term    text,                  -- net_30 | net_15 | etc.
  currency        text NOT NULL DEFAULT 'INR',
  exchange_rate   numeric,               -- market rate: INR per 1 unit of currency
  client_name     text,                  -- buyer/client name from the CSV (informational)
  notes           text,
  -- set when styles are bulk-received
  received_date           date,
  linked_transaction_id   uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own commission orders" ON commission_orders;
CREATE POLICY "Users manage own commission orders"
  ON commission_orders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON commission_orders TO authenticated;

-- 3. Style line items  (many per order)
CREATE TABLE IF NOT EXISTS commission_styles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES commission_orders(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  style_ref       text,                  -- style code / name
  quantity        numeric NOT NULL DEFAULT 0,
  rate_per_piece  numeric NOT NULL DEFAULT 0,
  total_value     numeric NOT NULL DEFAULT 0,   -- qty × rate
  commission_type text NOT NULL DEFAULT 'percentage',  -- percentage | per_piece | fixed
  commission_percentage  numeric,
  commission_per_piece   numeric,
  commission_fixed       numeric,
  commission_amount      numeric NOT NULL DEFAULT 0,   -- in order currency
  commission_inr         numeric NOT NULL DEFAULT 0,   -- converted at order.exchange_rate
  -- per-style fulfilment
  order_status           text NOT NULL DEFAULT 'current',
  etd                    date,
  shipped_date           date,
  expected_payment_date  date,
  received_date          date,
  linked_transaction_id  uuid REFERENCES transactions(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_styles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own commission styles" ON commission_styles;
CREATE POLICY "Users manage own commission styles"
  ON commission_styles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON commission_styles TO authenticated;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS commission_orders_user_idx    ON commission_orders (user_id);
CREATE INDEX IF NOT EXISTS commission_orders_customer_idx ON commission_orders (customer_id);
CREATE INDEX IF NOT EXISTS commission_styles_order_idx   ON commission_styles (order_id);
CREATE INDEX IF NOT EXISTS commission_styles_user_idx    ON commission_styles (user_id);
CREATE INDEX IF NOT EXISTS commission_styles_status_idx  ON commission_styles (order_status);
