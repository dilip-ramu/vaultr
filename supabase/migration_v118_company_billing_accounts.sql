-- ─────────────────────────────────────────────────────────────────────────────
-- v118 — Documents print YOUR OWN bank accounts, not a second copy of them
--
-- WHAT THIS CORRECTS
--
-- v117 introduced company_bank_accounts: a fresh table where you would re-type
-- account numbers that this app ALREADY stores. That was wrong. Accounts live
-- in `accounts`, they already carry account_number, ifsc_code, branch,
-- swift_code and bank_address, and since v100 they already carry company_id.
-- A second copy would drift from the first the day one of them was edited.
--
-- So: an account belongs to a company on the Accounts page, and every company's
-- accounts appear on the company automatically. Documents point at a real
-- account row.
--
-- WHAT IT DOES
--   1. companies.default_bank_account_id — which account this company's
--      documents use when they do not name one.
--   2. Repoints documents.bank_account_id and recoverable_invoices
--      .bank_account_id at accounts(id).
--   3. Backfills each company's default from the accounts already tagged to it.
--   4. Drops company_bank_accounts — but ONLY IF IT IS EMPTY, so a database
--      where v117 was applied and used is left alone rather than losing rows.
--
-- Safe to run whether or not v117 was applied.
--
-- ROLLBACK
--   ALTER TABLE companies DROP COLUMN IF EXISTS default_bank_account_id;
--   ALTER TABLE documents            DROP COLUMN IF EXISTS bank_account_id;
--   ALTER TABLE recoverable_invoices DROP COLUMN IF EXISTS bank_account_id;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The company's default account ────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_bank_account_id uuid
  REFERENCES accounts(id) ON DELETE SET NULL;

-- ── 2. Which account a document prints ──────────────────────────────────────
-- The columns may already exist from v117 pointing at the wrong table. Drop the
-- old constraint by name-independent lookup, then add the right one.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS bank_account_id uuid;
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS bank_account_id uuid;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND a.attname = 'bank_account_id'
       AND c.conrelid IN ('documents'::regclass, 'recoverable_invoices'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- Any value left over from v117 points at a row in the old table, which is not
-- an account id. Clear it rather than leave a dangling reference.
UPDATE documents            SET bank_account_id = NULL
 WHERE bank_account_id IS NOT NULL
   AND bank_account_id NOT IN (SELECT id FROM accounts);
UPDATE recoverable_invoices SET bank_account_id = NULL
 WHERE bank_account_id IS NOT NULL
   AND bank_account_id NOT IN (SELECT id FROM accounts);

ALTER TABLE documents
  ADD CONSTRAINT documents_bank_account_fk
  FOREIGN KEY (bank_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE recoverable_invoices
  ADD CONSTRAINT recoverable_invoices_bank_account_fk
  FOREIGN KEY (bank_account_id) REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_bank_account_idx ON documents (bank_account_id);
CREATE INDEX IF NOT EXISTS recoverable_invoices_bank_account_idx ON recoverable_invoices (bank_account_id);

-- ── 3. Backfill each company's default ──────────────────────────────────────
-- The first active account already tagged to that company. Companies with no
-- tagged account are left NULL, and their documents print no bank block until
-- an account is assigned — visibly missing beats quietly wrong.
UPDATE companies c
   SET default_bank_account_id = pick.id
  FROM (
    SELECT DISTINCT ON (a.company_id) a.company_id, a.id
      FROM accounts a
     WHERE a.company_id IS NOT NULL
       AND a.is_active
     ORDER BY a.company_id, a.created_at
  ) pick
 WHERE pick.company_id = c.id
   AND c.default_bank_account_id IS NULL;

-- ── 4. Remove the duplicate table, only if nothing was put in it ────────────
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.company_bank_accounts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM company_bank_accounts' INTO n;
    IF n = 0 THEN
      EXECUTE 'DROP TABLE company_bank_accounts';
      RAISE NOTICE 'company_bank_accounts was empty and has been dropped.';
    ELSE
      RAISE NOTICE 'company_bank_accounts has % row(s) and was KEPT. Move them onto the Accounts page, then drop it by hand.', n;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
