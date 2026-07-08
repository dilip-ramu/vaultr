-- ── Migration v76: bank Customer ID on accounts + debit cards ───────────────
-- The bank's own customer identifier (CIF / Customer ID) for an account or a
-- debit card. Free text, optional. Distinct from the app's `customers` table.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS bank_customer_id TEXT;

ALTER TABLE debit_cards
  ADD COLUMN IF NOT EXISTS bank_customer_id TEXT;

NOTIFY pgrst, 'reload schema';
