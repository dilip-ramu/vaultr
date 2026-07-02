-- ── Migration v67: customers.mirrored_company_id ─────────────────────────
-- Cross-company billing: when a user has multiple own companies and wants
-- to bill FROM one TO another, the "To" side needs to look like a customer.
-- Rather than having every invoice flow query both tables and merge them,
-- we mirror an "own company" into the customers table (with a back-reference
-- so we know it's a shadow, not a real external customer).
--
-- Behaviour:
--   ─ Toggle "Available as a customer" on the Company form is the switch
--   ─ ON  → API creates/updates a customers row with same name/details,
--          setting mirrored_company_id = company.id
--   ─ OFF → API deletes the mirror IF nothing points at it (invoices etc.);
--          otherwise refuses so history stays intact
--
-- The mirror row is a full customer row — appears in the directory, chip
-- pickers, invoice flows. UI marks it visually so users know it's a
-- self-owned company, not an external one.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS mirrored_company_id UUID
    REFERENCES companies(id) ON DELETE SET NULL;

-- Unique — one mirror per company per user. Prevents duplicates if the
-- toggle is flipped on twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_mirrored_company
  ON customers(user_id, mirrored_company_id)
  WHERE mirrored_company_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
