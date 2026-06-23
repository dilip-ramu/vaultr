-- ── Migration v40: more built-in account types ───────────────────────────────
-- Adds loan subtypes (auto/home/business) and Chit so accounts stop falling
-- under "Other". 'checking' is kept (now labelled "Current" in the app).
-- Only the CHECK constraint changes — no data is touched.

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN (
  'checking', 'savings', 'credit', 'cash', 'investment', 'loan',
  'auto_loan', 'home_loan', 'business_loan', 'chit', 'other'
));
