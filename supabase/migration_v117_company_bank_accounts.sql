-- ─────────────────────────────────────────────────────────────────────────────
-- v117 — Several bank accounts per company, and one chosen per document
--
-- WHY
-- A company had exactly one bank account, held as four columns on `companies`.
-- Real businesses hold more than one — a current account for domestic billing,
-- a separate one for exports, an EEFC account for foreign currency — and which
-- one appears on an invoice is a decision made per document, not per company.
--
-- WHAT THIS DOES
--   1. company_bank_accounts — many per company, one marked default.
--   2. BACKFILLS one row per company from the existing columns, so every
--      company keeps exactly the bank details it has today, marked default.
--      Nothing changes on any existing document.
--   3. Adds bank_account_id to documents and recoverable_invoices. NULL means
--      "use the company's default", so every existing document keeps printing
--      what it prints now.
--
-- The old companies.bank_* columns are deliberately LEFT IN PLACE. They are the
-- fallback for a company that somehow has no account row, and dropping columns
-- that historical code paths may still read is not worth the risk for four
-- fields. They stop being edited; the accounts table is the source of truth.
--
-- ROLLBACK
--   ALTER TABLE documents            DROP COLUMN IF EXISTS bank_account_id;
--   ALTER TABLE recoverable_invoices DROP COLUMN IF EXISTS bank_account_id;
--   DROP TABLE IF EXISTS company_bank_accounts CASCADE;
-- The companies.bank_* columns were never touched, so this is a clean revert.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- What you call it in the picker: "HDFC Current", "IOB Exports". Optional —
  -- the bank name and last four digits are shown when this is blank.
  label           text,

  bank_name       text,
  account_name    text,
  account_number  text,
  ifsc            text,
  swift_code      text,
  branch          text,

  -- Used when a document does not name one. Exactly one per company.
  is_default      boolean NOT NULL DEFAULT false,
  -- A closed account stays for historical documents but leaves the picker.
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_bank_accounts_company_idx
  ON company_bank_accounts (company_id, is_active, sort_order);

-- ONE default per company, enforced by the database rather than by hoping the
-- UI is careful. Two defaults would mean an invoice's bank depends on row order.
CREATE UNIQUE INDEX IF NOT EXISTS company_bank_accounts_one_default
  ON company_bank_accounts (company_id) WHERE is_default;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every company that has any bank detail today gets exactly that, as its
-- default account. Idempotent: running this twice does not duplicate, because
-- it skips companies that already have an account row.
INSERT INTO company_bank_accounts
  (user_id, company_id, label, bank_name, account_name, account_number, ifsc, swift_code, is_default)
SELECT
  c.user_id, c.id,
  NULL,
  c.bank_name, c.bank_account_name, c.bank_account_number, c.bank_ifsc, c.swift_code,
  true
FROM companies c
WHERE (
    NULLIF(btrim(coalesce(c.bank_name, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.bank_account_number, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.bank_ifsc, '')), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM company_bank_accounts b WHERE b.company_id = c.id
  );

-- ── Which account a document uses ───────────────────────────────────────────
-- NULL = the company's default. Existing rows are therefore unchanged, and a
-- document keeps its account even if the default later moves.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS bank_account_id uuid
  REFERENCES company_bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS bank_account_id uuid
  REFERENCES company_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_bank_account_idx ON documents (bank_account_id);
CREATE INDEX IF NOT EXISTS recoverable_invoices_bank_account_idx ON recoverable_invoices (bank_account_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE company_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_bank_accounts_owner ON company_bank_accounts;
CREATE POLICY company_bank_accounts_owner ON company_bank_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
