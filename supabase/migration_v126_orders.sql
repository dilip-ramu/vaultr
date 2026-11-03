-- ─────────────────────────────────────────────────────────────────────────────
-- v126 — Orders: the spine a trade hangs off
--
-- Inex could already make every piece of paper in a trade, but the sell chain
-- (quotation → sales order → proforma → challan → customer invoice) and the
-- buy chain (purchase order → supplier bill) never met. Nothing recorded that
-- THIS purchase order was raised to fill THAT sales order, so the question
-- "what did I make on the Pengvin order?" had no answer anywhere in the app.
--
-- An order is one customer PO. Every document, invoice, bill and bank entry
-- that belongs to that job points at it. Nothing is moved and nothing is
-- rewritten: the link is a nullable column, so every row that exists today
-- keeps working with it empty, and anything that should never belong to an
-- order (a one-off courier invoice) simply never gets one.
--
-- NAMING. `orders` is this record. The two DOCUMENTS keep the names they have
-- always had, documents.doc_type = 'sales_order' | 'purchase_order'. On screen
-- those two are always written out in full so a bare "Order" is never
-- ambiguous. `commission_orders` is a different business (commission earned on
-- someone else's trade) and is deliberately untouched.
--
-- ROLLBACK
--   ALTER TABLE transactions        DROP COLUMN IF EXISTS order_id, DROP COLUMN IF EXISTS order_close_entry;
--   ALTER TABLE supplier_invoices   DROP COLUMN IF EXISTS order_id;
--   ALTER TABLE recoverable_invoices DROP COLUMN IF EXISTS order_id;
--   ALTER TABLE documents           DROP COLUMN IF EXISTS order_id;
--   DROP TABLE IF EXISTS order_costs;
--   DROP TABLE IF EXISTS order_lines;
--   DROP TABLE IF EXISTS orders;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The order ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,

  -- One customer per order, fixed at creation. Decided, not a simplification
  -- to be relaxed later: a sheet that mixes two customers cannot say what you
  -- made on either.
  customer_id       uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     text NOT NULL,

  -- The customer's own PO is what starts the job, so it is the order's
  -- identity. `number` is ours, for when theirs is missing or unusable.
  number            text NOT NULL,
  customer_po_no    text,
  customer_po_date  date,

  stage             text NOT NULL DEFAULT 'confirmed',   -- see lib/orders/stage.ts
  order_date        date NOT NULL DEFAULT CURRENT_DATE,

  -- Export orders carry a foreign currency and two rates: the one you costed
  -- at and the one the bank actually gave you. Domestic orders are INR at 1,
  -- and every FX line then falls away on its own.
  currency          text NOT NULL DEFAULT 'INR',
  booked_rate       numeric NOT NULL DEFAULT 1,          -- INR per 1 unit, when costing
  realised_rate     numeric,                             -- what the bank gave; NULL until paid

  -- Duty drawback. Plain percentage of FOB or a flat amount — no per-unit cap.
  drawback_basis    text,                                -- 'percent' | 'amount' | NULL (no drawback)
  drawback_value    numeric NOT NULL DEFAULT 0,
  drawback_actual   numeric,                             -- what really landed
  drawback_expected_date date,
  drawback_received_date date,

  notes             text,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);

-- ── 2. What was ordered ─────────────────────────────────────────────────────
-- One row per style. Carries BOTH rates, because the same line is what you
-- sell to the customer and what you buy from the supplier — that pairing is
-- the whole margin, and splitting it across two tables would let them drift.
CREATE TABLE IF NOT EXISTS order_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_number   int NOT NULL DEFAULT 1,
  item          text NOT NULL,
  hsn_sac       text,
  qty           numeric NOT NULL DEFAULT 0,
  sell_rate     numeric NOT NULL DEFAULT 0,   -- order currency, per unit
  cost_rate     numeric NOT NULL DEFAULT 0,   -- INR, per unit, agreed with the supplier
  shipped_qty   numeric NOT NULL DEFAULT 0,   -- part shipments: how much has gone
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Costs and adjustments ────────────────────────────────────────────────
-- Freight, clearing, inspection, bank charges, agent commission, a discount
-- given, a penalty taken. Each is a flat rupee amount OR a percentage of one
-- of three bases. Percentage of NET is deliberately not offered: it would
-- depend on itself.
CREATE TABLE IF NOT EXISTS order_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_number   int NOT NULL DEFAULT 1,
  name          text NOT NULL,
  sign          int NOT NULL DEFAULT -1 CHECK (sign IN (1, -1)),
  basis         text NOT NULL DEFAULT 'flat'
                CHECK (basis IN ('flat','pct_customer','pct_supplier','pct_gross')),
  planned       numeric NOT NULL DEFAULT 0,   -- rupees when flat, else a percentage
  actual        numeric,                      -- NULL = not known yet
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Everything else points at the order ──────────────────────────────────
ALTER TABLE documents            ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE recoverable_invoices ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE supplier_invoices    ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE transactions         ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

-- Closing an order writes bank entries. Reopening must remove exactly those
-- and never anything entered by hand, so the ones it wrote are tagged.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_close_entry boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.order_close_entry IS
  'True only for entries written by closing an order. Reopening deletes exactly these.';

-- ── 5. Security — same shape as every other table here ──────────────────────
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_all      ON orders;
DROP POLICY IF EXISTS order_lines_all ON order_lines;
DROP POLICY IF EXISTS order_costs_all ON order_costs;

CREATE POLICY orders_all      ON orders      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY order_lines_all ON order_lines FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY order_costs_all ON order_costs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_costs TO authenticated;

-- ── 6. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_user_idx        ON orders(user_id, stage, order_date DESC);
CREATE INDEX IF NOT EXISTS order_lines_order_idx  ON order_lines(order_id, line_number);
CREATE INDEX IF NOT EXISTS order_costs_order_idx  ON order_costs(order_id, line_number);
CREATE INDEX IF NOT EXISTS documents_order_idx    ON documents(order_id)            WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rec_inv_order_idx      ON recoverable_invoices(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sup_inv_order_idx      ON supplier_invoices(order_id)    WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS txn_order_idx          ON transactions(order_id)         WHERE order_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
