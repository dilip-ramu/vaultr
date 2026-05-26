-- ── Rename supplier_name → customer_name ─────────────────────────────────
ALTER TABLE recoverable_allocations RENAME COLUMN supplier_name TO customer_name;

DROP INDEX IF EXISTS idx_ra_supplier;
CREATE INDEX IF NOT EXISTS idx_ra_customer_name ON recoverable_allocations(user_id, customer_name, status);

DROP POLICY IF EXISTS "ra_select" ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_insert" ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_update" ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_delete" ON recoverable_allocations;
CREATE POLICY "ra_select" ON recoverable_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ra_insert" ON recoverable_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ra_update" ON recoverable_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ra_delete" ON recoverable_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── recoverable_invoice_settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_invoice_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_prefix       TEXT NOT NULL DEFAULT 'INV-',
  next_invoice_number  INT  NOT NULL DEFAULT 1,
  cgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  sgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  hsn_sac              TEXT NOT NULL DEFAULT '996812',
  payment_terms        TEXT NOT NULL DEFAULT 'due_on_receipt',
  company_name         TEXT,
  company_address      TEXT,
  company_gstin        TEXT,
  company_phone        TEXT,
  company_email        TEXT,
  bank_account_name    TEXT,
  bank_account_number  TEXT,
  bank_ifsc            TEXT,
  bank_name            TEXT,
  terms_conditions     TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── recoverable_invoices ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_address TEXT,
  customer_gstin   TEXT,
  customer_state   TEXT,
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,
  payment_terms    TEXT NOT NULL DEFAULT 'due_on_receipt',
  markup_type      TEXT NOT NULL DEFAULT 'none' CHECK (markup_type IN ('percentage','flat','none')),
  markup_value     DECIMAL(10,4) NOT NULL DEFAULT 0,
  subtotal         DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst_rate        DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  sgst_rate        DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  cgst_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total            DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  balance_due      DECIMAL(15,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  currency         TEXT NOT NULL DEFAULT 'INR',
  notes            TEXT,
  pdf_path         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, invoice_number)
);

-- ── recoverable_invoice_lines ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_invoice_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES recoverable_invoices(id) ON DELETE CASCADE,
  allocation_id UUID REFERENCES recoverable_allocations(id) ON DELETE SET NULL,
  line_number   INT  NOT NULL,
  awb           TEXT NOT NULL,
  shipment_date DATE,
  hsn_sac       TEXT NOT NULL DEFAULT '996812',
  qty           INT  NOT NULL DEFAULT 0,
  base_rate     DECIMAL(15,4) NOT NULL DEFAULT 0,
  rate          DECIMAL(15,4) NOT NULL DEFAULT 0,
  amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst_rate     DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  cgst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_rate     DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  sgst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ri_user_id     ON recoverable_invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ri_customer    ON recoverable_invoices(user_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_ril_invoice    ON recoverable_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ril_allocation ON recoverable_invoice_lines(allocation_id);

-- ── RLS + Grants ──────────────────────────────────────────────────────────
ALTER TABLE recoverable_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_invoice_lines     ENABLE ROW LEVEL SECURITY;

GRANT ALL ON recoverable_invoice_settings TO authenticated;
GRANT ALL ON recoverable_invoices          TO authenticated;
GRANT ALL ON recoverable_invoice_lines     TO authenticated;

DROP POLICY IF EXISTS "ris_select" ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_insert" ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_update" ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_delete" ON recoverable_invoice_settings;
CREATE POLICY "ris_select" ON recoverable_invoice_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ris_insert" ON recoverable_invoice_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ris_update" ON recoverable_invoice_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ris_delete" ON recoverable_invoice_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rinv_select" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_insert" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_update" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_delete" ON recoverable_invoices;
CREATE POLICY "rinv_select" ON recoverable_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rinv_insert" ON recoverable_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rinv_update" ON recoverable_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rinv_delete" ON recoverable_invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ril_select" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_insert" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_update" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_delete" ON recoverable_invoice_lines;
CREATE POLICY "ril_select" ON recoverable_invoice_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ril_insert" ON recoverable_invoice_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ril_update" ON recoverable_invoice_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ril_delete" ON recoverable_invoice_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── updated_at trigger for recoverable_invoices ───────────────────────────
DROP TRIGGER IF EXISTS trg_ri_updated_at ON recoverable_invoices;
CREATE TRIGGER trg_ri_updated_at
  BEFORE UPDATE ON recoverable_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
