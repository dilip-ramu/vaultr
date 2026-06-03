-- migration_v28: bidirectional linking between customer invoices and supplier invoices
-- One supplier invoice can be referenced in multiple customer invoices (cost sharing),
-- and one customer invoice can reference multiple supplier invoices.

-- ── Junction table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_supplier_links (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recoverable_invoice_id   UUID        NOT NULL REFERENCES recoverable_invoices(id) ON DELETE CASCADE,
  supplier_invoice_id      UUID        NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  -- Optional: the portion of the supplier invoice attributed to this customer invoice.
  -- NULL means "linked but not yet quantified".
  allocated_amount         DECIMAL(14,2),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate links for the same pair
  UNIQUE(recoverable_invoice_id, supplier_invoice_id)
);

ALTER TABLE invoice_supplier_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "isl_all" ON invoice_supplier_links;
CREATE POLICY "isl_all" ON invoice_supplier_links
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON invoice_supplier_links TO authenticated;
GRANT ALL ON invoice_supplier_links TO anon;

-- Fast lookup in both directions
CREATE INDEX IF NOT EXISTS idx_isl_recoverable ON invoice_supplier_links(recoverable_invoice_id);
CREATE INDEX IF NOT EXISTS idx_isl_supplier    ON invoice_supplier_links(supplier_invoice_id);

-- ── Shipment refs column ──────────────────────────────────────────────────────
-- Stores comma-separated supplier invoice numbers parsed from the CSV column
-- "Supplier Invoice Refs" (or similar). Enables auto-linking on invoice creation.

ALTER TABLE recoverable_shipments
  ADD COLUMN IF NOT EXISTS supplier_invoice_refs TEXT;
