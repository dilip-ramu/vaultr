-- ── Migration v93: document links + lifecycle ───────────────────────────────
-- Lets any document be created FROM another (converted) or ADJUST an invoice
-- (credit/debit notes), forming Zoho-style chains — without touching the
-- existing invoice / courier / reimbursable / supplier-bundling tables.
-- Purely additive: a link table + a status column on documents.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

CREATE TABLE IF NOT EXISTS document_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- kinds: 'document' | 'recoverable_invoice' | 'supplier_invoice'
  source_kind TEXT NOT NULL,
  source_id   UUID NOT NULL,
  target_kind TEXT NOT NULL,
  target_id   UUID NOT NULL,
  relation    TEXT NOT NULL DEFAULT 'converted',   -- 'converted' | 'adjusts'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_links_all" ON document_links;
CREATE POLICY "document_links_all" ON document_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON document_links TO authenticated;

CREATE INDEX IF NOT EXISTS idx_doclinks_source ON document_links(source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_doclinks_target ON document_links(target_kind, target_id);
