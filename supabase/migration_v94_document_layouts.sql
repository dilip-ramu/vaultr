-- ── Migration v94: per-company editable document templates ──────────────────
-- Stores a coordinate-based layout (JSON) per company + format. When absent,
-- the app renders the built-in design — so this is fully additive.
-- Delivery challan (customer & supplier) share format 'delivery_challan'.

CREATE TABLE IF NOT EXISTS document_layouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  format     TEXT NOT NULL,   -- tax_invoice | quotation | proforma_gst | sales_order | delivery_challan | credit_note | purchase_order | debit_note | salary_slip
  schema     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id, format)
);

ALTER TABLE document_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_layouts_all" ON document_layouts;
CREATE POLICY "document_layouts_all" ON document_layouts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON document_layouts TO authenticated;

CREATE INDEX IF NOT EXISTS idx_doclayouts_lookup ON document_layouts(user_id, company_id, format);
