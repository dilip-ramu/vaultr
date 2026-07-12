-- ── Migration v100: what belongs to which company ───────────────────────────
--
-- Invoices, supplier bills, documents and employees already carry a company_id.
-- Assets and accounts do not — so there is no way to say "this bank account and
-- this machine belong to Lullabee". Without that, a per-company balance sheet
-- can only ever show receivables and payables, which isn't a balance sheet.
--
-- Both columns are NULLABLE and default to NULL on purpose:
--   • nothing is silently reassigned,
--   • anything untagged is treated as personal / unassigned and shown in its own
--     bucket in the company view,
--   • the main page's net worth is COMPLETELY unaffected — it does not read
--     these columns at all. (Splitting personal vs company net worth is a
--     separate decision, deliberately not taken here.)
--
-- Revert: drop the two columns. Nothing else depends on them.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_company   ON assets(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(user_id, company_id);
