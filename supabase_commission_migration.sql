-- ─────────────────────────────────────────────────────────────────
-- Commission tracking migration
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Add pays_commission flag to existing customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pays_commission boolean NOT NULL DEFAULT false;

-- 2. Create commission_orders table
CREATE TABLE IF NOT EXISTS commission_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id             uuid REFERENCES customers(id) ON DELETE SET NULL,
  account_id              uuid REFERENCES accounts(id) ON DELETE SET NULL,

  order_number            text,
  order_date              date NOT NULL DEFAULT CURRENT_DATE,
  etd                     date,                        -- estimated delivery date

  -- Order fulfilment status
  -- backlog | current | shipped | received | cancelled
  order_status            text NOT NULL DEFAULT 'current',
  shipped_date            date,                        -- set when marked shipped
  expected_payment_date   date,                        -- auto = shipped_date + payment_term days

  quantity                numeric NOT NULL DEFAULT 0,
  rate_per_piece          numeric NOT NULL DEFAULT 0,
  total_value             numeric NOT NULL DEFAULT 0,  -- quantity × rate_per_piece

  commission_type         text NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'per_piece' | 'fixed'
  commission_percentage   numeric,
  commission_per_piece    numeric,
  commission_fixed        numeric,

  -- Foreign-currency commission
  currency                text NOT NULL DEFAULT 'INR',
  commission_amount       numeric NOT NULL DEFAULT 0,  -- amount in `currency`
  exchange_rate           numeric,                     -- INR per 1 unit of currency (null when INR)
  commission_inr          numeric NOT NULL DEFAULT 0,  -- final INR amount

  payment_term            text,
  received_date           date,
  linked_transaction_id   uuid REFERENCES transactions(id) ON DELETE SET NULL,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- 3. Row-level security
ALTER TABLE commission_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own commission orders"
  ON commission_orders FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS commission_orders_user_id_idx       ON commission_orders (user_id);
CREATE INDEX IF NOT EXISTS commission_orders_customer_id_idx   ON commission_orders (customer_id);
CREATE INDEX IF NOT EXISTS commission_orders_order_status_idx  ON commission_orders (order_status);
