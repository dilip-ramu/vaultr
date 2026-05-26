-- ============================================================
-- Vaultr Migration v8 — Courier Allocation & Supplier Billing
-- Run in Supabase SQL Editor. Additive only — no drops.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. courier_invoices
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id      UUID REFERENCES households(id),

  courier_provider  TEXT NOT NULL,
  invoice_number    TEXT NOT NULL,
  invoice_date      DATE NOT NULL,
  due_date          DATE,
  currency          TEXT NOT NULL DEFAULT 'INR',

  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','paid','cancelled')),
  paid_at           TIMESTAMPTZ,
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,

  file_path         TEXT,
  file_name         TEXT,
  file_type         TEXT,

  ocr_status        TEXT NOT NULL DEFAULT 'none'
                    CHECK (ocr_status IN ('none','queued','processing','done','failed')),
  ocr_raw_data      JSONB,
  ocr_confidence    DECIMAL(5,2),

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own courier_invoices"
  ON courier_invoices FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Household members can access courier_invoices"
  ON courier_invoices FOR ALL
  USING (
    household_id IS NOT NULL AND
    household_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_courier_invoices_user_status
  ON courier_invoices(user_id, status);

-- ────────────────────────────────────────────────────────────
-- 2. awbs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS awbs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  courier_invoice_id    UUID NOT NULL REFERENCES courier_invoices(id) ON DELETE CASCADE,

  awb_number            TEXT NOT NULL,
  shipment_date         DATE,
  destination_country   TEXT,
  destination_city      TEXT,
  receiver_name         TEXT,
  receiver_reference    TEXT,

  actual_weight         DECIMAL(10,3),
  volumetric_weight     DECIMAL(10,3),
  chargeable_weight     DECIMAL(10,3),
  weight_unit           TEXT NOT NULL DEFAULT 'KG',

  shipment_charge       DECIMAL(15,2) NOT NULL DEFAULT 0,
  fuel_surcharge        DECIMAL(15,2) NOT NULL DEFAULT 0,
  demand_surcharge      DECIMAL(15,2) NOT NULL DEFAULT 0,
  gogreen_surcharge     DECIMAL(15,2) NOT NULL DEFAULT 0,
  remote_area_charge    DECIMAL(15,2) NOT NULL DEFAULT 0,
  other_charges         DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount            DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_charge          DECIMAL(15,2) GENERATED ALWAYS AS (
                          shipment_charge + fuel_surcharge + demand_surcharge +
                          gogreen_surcharge + remote_area_charge + other_charges + tax_amount
                        ) STORED,

  total_pieces          INT NOT NULL DEFAULT 0,
  allocated_pieces      INT NOT NULL DEFAULT 0,
  per_piece_base_cost   DECIMAL(15,4),

  service_type          TEXT,
  product_code          TEXT,
  raw_line_data         JSONB,

  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(courier_invoice_id, awb_number)
);

ALTER TABLE awbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own awbs"
  ON awbs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_awbs_courier_invoice_id
  ON awbs(courier_invoice_id);

CREATE INDEX IF NOT EXISTS idx_awbs_user_id
  ON awbs(user_id);

-- ────────────────────────────────────────────────────────────
-- 3. markup_rules
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markup_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  markup_type       TEXT NOT NULL DEFAULT 'percentage'
                    CHECK (markup_type IN ('percentage','flat','none')),
  markup_value      DECIMAL(10,4) NOT NULL DEFAULT 0,
  minimum_amount    DECIMAL(15,2),
  courier_provider  TEXT,

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, customer_id, courier_provider)
);

ALTER TABLE markup_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own markup_rules"
  ON markup_rules FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_markup_rules_user_customer
  ON markup_rules(user_id, customer_id);

-- ────────────────────────────────────────────────────────────
-- 4. supplier_invoices
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id      UUID REFERENCES households(id),
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  invoice_number    TEXT NOT NULL,
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  payment_terms     TEXT DEFAULT 'net_30',

  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_rate          DECIMAL(5,2) DEFAULT 0,
  tax_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',

  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at           TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,

  pdf_path          TEXT,
  notes             TEXT,
  internal_notes    TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own supplier_invoices"
  ON supplier_invoices FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Household members can access supplier_invoices"
  ON supplier_invoices FOR ALL
  USING (
    household_id IS NOT NULL AND
    household_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_customer_id
  ON supplier_invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_user_status
  ON supplier_invoices(user_id, status);

-- ────────────────────────────────────────────────────────────
-- 5. supplier_invoice_lines
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_invoice_id   UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  awb_id                UUID REFERENCES awbs(id) ON DELETE SET NULL,

  description           TEXT NOT NULL,
  awb_number            TEXT,
  pieces                INT,
  weight_kg             DECIMAL(10,3),
  shipment_date         DATE,
  destination           TEXT,

  unit_price            DECIMAL(15,4),
  quantity              INT NOT NULL DEFAULT 1,
  line_total            DECIMAL(15,2) NOT NULL,

  sort_order            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplier_invoice_lines ENABLE ROW LEVEL SECURITY;

-- Lines inherit access via their parent invoice
CREATE POLICY "Users can CRUD own supplier_invoice_lines"
  ON supplier_invoice_lines FOR ALL
  USING (
    supplier_invoice_id IN (
      SELECT id FROM supplier_invoices WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_invoice_id
  ON supplier_invoice_lines(supplier_invoice_id);

-- ────────────────────────────────────────────────────────────
-- 6. awb_allocations
--    (after supplier_invoices — FK references it)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS awb_allocations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  awb_id                UUID NOT NULL REFERENCES awbs(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  pieces                INT NOT NULL DEFAULT 1 CHECK (pieces > 0),
  weight_kg             DECIMAL(10,3),

  base_cost             DECIMAL(15,2),
  markup_type           TEXT NOT NULL DEFAULT 'percentage'
                        CHECK (markup_type IN ('percentage','flat','none')),
  markup_value          DECIMAL(10,4) NOT NULL DEFAULT 0,
  markup_amount         DECIMAL(15,2),
  billed_amount         DECIMAL(15,2),
  minimum_amount        DECIMAL(15,2),

  supplier_invoice_id   UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  invoiced_at           TIMESTAMPTZ,

  override_amount       DECIMAL(15,2),
  override_reason       TEXT,

  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE awb_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own awb_allocations"
  ON awb_allocations FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_awb_allocations_awb_id
  ON awb_allocations(awb_id);

CREATE INDEX IF NOT EXISTS idx_awb_allocations_customer_id
  ON awb_allocations(customer_id);

CREATE INDEX IF NOT EXISTS idx_awb_allocations_supplier_invoice_id
  ON awb_allocations(supplier_invoice_id);

-- ────────────────────────────────────────────────────────────
-- 7. Extend existing attachments table
-- ────────────────────────────────────────────────────────────
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS courier_invoice_id UUID
  REFERENCES courier_invoices(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 8. Auto-increment supplier invoice number
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_supplier_invoice_number(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT 'SI-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(
      COALESCE(
        (SELECT COUNT(*) + 1
         FROM supplier_invoices
         WHERE user_id = p_user_id
           AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
        )::TEXT,
        '1'
      ),
      4, '0'
    )
$$ LANGUAGE SQL STABLE;

-- ────────────────────────────────────────────────────────────
-- 9. updated_at triggers
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'courier_invoices', 'awbs', 'markup_rules',
    'supplier_invoices', 'awb_allocations'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
