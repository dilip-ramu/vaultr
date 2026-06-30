-- ── Migration v54: per-transaction "Used for" company ─────────────────────
-- Each transaction can optionally point at one of YOUR own companies. NULL =
-- personal. Lets you slice spending by which entity bore the cost without
-- changing payee / category / customer-billing semantics.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS used_for_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tx_used_for ON transactions(user_id, used_for_company_id);
