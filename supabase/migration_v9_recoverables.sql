-- ═══════════════════════════════════════════════════════════
-- Migration v9: Recoverables Module
-- Additive only. Safe to run on production.
-- ═══════════════════════════════════════════════════════════

-- ── 1. recoverable_import_batches ───────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_import_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  source            TEXT,
  import_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  currency          TEXT NOT NULL DEFAULT 'INR',
  csv_path          TEXT,
  row_count         INT  NOT NULL DEFAULT 0,
  reference_count   INT  NOT NULL DEFAULT 0,
  supplier_count    INT  NOT NULL DEFAULT 0,
  total_cost        DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_recoverable DECIMAL(15,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processed','failed')),
  validation_errors JSONB,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. recoverable_shipments ────────────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_shipments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id       UUID NOT NULL REFERENCES recoverable_import_batches(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL,
  total_cost     DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_pieces   INT  NOT NULL DEFAULT 0,
  per_piece_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
  source         TEXT,
  shipment_date  DATE,
  destination    TEXT,
  weight_kg      DECIMAL(10,3),
  raw_row        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, reference)
);

-- ── 3. recoverable_allocations ──────────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id           UUID NOT NULL REFERENCES recoverable_import_batches(id) ON DELETE CASCADE,
  shipment_id        UUID NOT NULL REFERENCES recoverable_shipments(id) ON DELETE CASCADE,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_name      TEXT NOT NULL,
  pieces             INT  NOT NULL DEFAULT 0,
  base_cost          DECIMAL(15,4) NOT NULL DEFAULT 0,
  markup_type        TEXT NOT NULL DEFAULT 'none'
                     CHECK (markup_type IN ('percentage','flat','none')),
  markup_value       DECIMAL(10,4) NOT NULL DEFAULT 0,
  markup_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  recoverable_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','billed','paid','cancelled')),
  billed_at          TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rib_user_id ON recoverable_import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_rs_batch_id ON recoverable_shipments(batch_id);
CREATE INDEX IF NOT EXISTS idx_ra_batch_id ON recoverable_allocations(batch_id);
CREATE INDEX IF NOT EXISTS idx_ra_supplier ON recoverable_allocations(user_id, supplier_name, status);
CREATE INDEX IF NOT EXISTS idx_ra_customer ON recoverable_allocations(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_ra_shipment ON recoverable_allocations(shipment_id);

-- ── Enable RLS ───────────────────────────────────────────────
ALTER TABLE recoverable_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_shipments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_allocations     ENABLE ROW LEVEL SECURITY;

-- ── Grant table access ───────────────────────────────────────
GRANT ALL ON recoverable_import_batches TO authenticated;
GRANT ALL ON recoverable_shipments       TO authenticated;
GRANT ALL ON recoverable_allocations     TO authenticated;

GRANT ALL ON recoverable_import_batches TO service_role;
GRANT ALL ON recoverable_shipments       TO service_role;
GRANT ALL ON recoverable_allocations     TO service_role;

-- ── RLS policies (drop first to make idempotent) ─────────────
DROP POLICY IF EXISTS "rib_select" ON recoverable_import_batches;
DROP POLICY IF EXISTS "rib_insert" ON recoverable_import_batches;
DROP POLICY IF EXISTS "rib_update" ON recoverable_import_batches;
DROP POLICY IF EXISTS "rib_delete" ON recoverable_import_batches;

DROP POLICY IF EXISTS "rs_select"  ON recoverable_shipments;
DROP POLICY IF EXISTS "rs_insert"  ON recoverable_shipments;
DROP POLICY IF EXISTS "rs_update"  ON recoverable_shipments;
DROP POLICY IF EXISTS "rs_delete"  ON recoverable_shipments;

DROP POLICY IF EXISTS "ra_select"  ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_insert"  ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_update"  ON recoverable_allocations;
DROP POLICY IF EXISTS "ra_delete"  ON recoverable_allocations;

-- recoverable_import_batches
CREATE POLICY "rib_select" ON recoverable_import_batches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rib_insert" ON recoverable_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rib_update" ON recoverable_import_batches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rib_delete" ON recoverable_import_batches FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- recoverable_shipments
CREATE POLICY "rs_select" ON recoverable_shipments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rs_insert" ON recoverable_shipments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rs_update" ON recoverable_shipments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rs_delete" ON recoverable_shipments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- recoverable_allocations
CREATE POLICY "ra_select" ON recoverable_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ra_insert" ON recoverable_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ra_update" ON recoverable_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ra_delete" ON recoverable_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── updated_at trigger function ──────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$;

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_rib_updated_at ON recoverable_import_batches;
DROP TRIGGER IF EXISTS trg_ra_updated_at  ON recoverable_allocations;

CREATE TRIGGER trg_rib_updated_at
  BEFORE UPDATE ON recoverable_import_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ra_updated_at
  BEFORE UPDATE ON recoverable_allocations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
