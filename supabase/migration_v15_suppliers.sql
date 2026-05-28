-- ── Migration v15: Suppliers + Supplier Invoices Module ─────────────────────
-- Drop tables first (safe in dev — no data yet) so IF NOT EXISTS can't hide
-- a stale/incomplete schema from a previous partial run.
DROP TABLE IF EXISTS supplier_invoices   CASCADE;
DROP TABLE IF EXISTS suppliers           CASCADE;
DROP TABLE IF EXISTS bulk_payment_batches CASCADE;

-- ── bulk_payment_batches (created first — invoices FK references it) ─────────
CREATE TABLE bulk_payment_batches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_reference  TEXT        NOT NULL,
  payment_date     DATE        NOT NULL,
  bank_reference   TEXT,
  total_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  invoice_count    INT         NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bulk_payment_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bpb_select" ON bulk_payment_batches;
DROP POLICY IF EXISTS "bpb_insert" ON bulk_payment_batches;
DROP POLICY IF EXISTS "bpb_update" ON bulk_payment_batches;
DROP POLICY IF EXISTS "bpb_delete" ON bulk_payment_batches;
CREATE POLICY "bpb_select" ON bulk_payment_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bpb_insert" ON bulk_payment_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bpb_update" ON bulk_payment_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "bpb_delete" ON bulk_payment_batches FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON bulk_payment_batches TO authenticated;
GRANT ALL ON bulk_payment_batches TO anon;

-- ── suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_code    TEXT,
  name             TEXT        NOT NULL,
  contact_person   TEXT,
  mobile           TEXT,
  email            TEXT,
  address          TEXT,
  gst_number       TEXT,
  pan_number       TEXT,
  bank_name        TEXT,
  account_number   TEXT,
  ifsc_swift       TEXT,
  payment_terms    TEXT        NOT NULL DEFAULT '30',  -- 'immediate','7','15','30','45','60','custom'
  custom_terms_days INT,                                -- used when payment_terms = 'custom'
  currency         TEXT        NOT NULL DEFAULT 'INR',
  notes            TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sup_select" ON suppliers;
DROP POLICY IF EXISTS "sup_insert" ON suppliers;
DROP POLICY IF EXISTS "sup_update" ON suppliers;
DROP POLICY IF EXISTS "sup_delete" ON suppliers;
CREATE POLICY "sup_select" ON suppliers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sup_insert" ON suppliers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sup_update" ON suppliers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sup_delete" ON suppliers FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON suppliers TO authenticated;
GRANT ALL ON suppliers TO anon;

-- ── supplier_invoices ────────────────────────────────────────────────────────
-- status: pending | due | overdue | paid | partial | cancelled
-- recoverable_status: pending_billing | billed | recovered | partial_recovery | written_off
CREATE TABLE supplier_invoices (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id              UUID        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number           TEXT,
  invoice_date             DATE        NOT NULL,
  due_date                 DATE,
  amount                   DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency                 TEXT        NOT NULL DEFAULT 'INR',
  category                 TEXT,
  notes                    TEXT,
  -- attachment stored in Supabase Storage
  attachment_path          TEXT,
  attachment_name          TEXT,
  attachment_size          BIGINT,
  -- recoverable tracking
  is_recoverable           BOOLEAN     NOT NULL DEFAULT FALSE,
  linked_customer_name     TEXT,
  billed_to_customer       BOOLEAN     NOT NULL DEFAULT FALSE,
  recoverable_status       TEXT,       -- NULL when not recoverable
  recoverable_notes        TEXT,
  billed_invoice_ref       TEXT,       -- reference to customer invoice when billed
  recovered_date           DATE,
  -- payment tracking
  is_paid                  BOOLEAN     NOT NULL DEFAULT FALSE,
  payment_date             DATE,
  payment_reference        TEXT,
  bulk_payment_batch_id    UUID        REFERENCES bulk_payment_batches(id) ON DELETE SET NULL,
  -- computed status
  status                   TEXT        NOT NULL DEFAULT 'pending',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_select" ON supplier_invoices;
DROP POLICY IF EXISTS "si_insert" ON supplier_invoices;
DROP POLICY IF EXISTS "si_update" ON supplier_invoices;
DROP POLICY IF EXISTS "si_delete" ON supplier_invoices;
CREATE POLICY "si_select" ON supplier_invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "si_insert" ON supplier_invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "si_update" ON supplier_invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "si_delete" ON supplier_invoices FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON supplier_invoices TO authenticated;
GRANT ALL ON supplier_invoices TO anon;

-- ── Indexes for common query patterns ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_id ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status      ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_recoverable ON supplier_invoices(is_recoverable, recoverable_status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date    ON supplier_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_batch       ON supplier_invoices(bulk_payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_active         ON suppliers(user_id, is_active);
