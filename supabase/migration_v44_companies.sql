-- ── Migration v44: Multi-company support ─────────────────────────────────────
-- Users were limited to one "company" of their own (recoverable_invoice_settings,
-- which is keyed by user_id PK = single row). This makes companies a real list
-- so a user can invoice from "Contrast", "Other Ltd", etc., each with its own
-- branding, bank details, GST, terms, and logo.
--
-- After running this migration, the app reads/writes the `companies` table.
-- The old `recoverable_invoice_settings` row is left in place for now (no data
-- loss) but is no longer queried; it can be dropped manually later.

-- 1. companies table
CREATE TABLE IF NOT EXISTS companies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  is_default           BOOLEAN NOT NULL DEFAULT false,

  -- Company details
  address              TEXT,
  gstin                TEXT,
  phone                TEXT,
  email                TEXT,

  -- Bank details
  bank_account_name    TEXT,
  bank_account_number  TEXT,
  bank_ifsc            TEXT,
  bank_name            TEXT,

  -- Invoice defaults
  invoice_prefix       TEXT NOT NULL DEFAULT 'INV-',
  next_invoice_number  INT  NOT NULL DEFAULT 1,
  cgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  sgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  hsn_sac              TEXT NOT NULL DEFAULT '996812',
  payment_terms        TEXT NOT NULL DEFAULT 'due_on_receipt',
  terms_conditions     TEXT,

  -- Logo: path inside the public 'vaultr-avatars' bucket, e.g.
  -- '<user_id>/companies/<company_id>.png'. Resolve via the bucket's public URL.
  logo_path            TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_all" ON companies;
CREATE POLICY "companies_all" ON companies FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON companies TO authenticated;

CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);

-- Enforce exactly one default company per user (when at least one exists).
-- A partial unique index does the job — only rows with is_default=true are
-- indexed, and we enforce uniqueness across that filtered set.
DROP INDEX IF EXISTS uq_companies_one_default;
CREATE UNIQUE INDEX uq_companies_one_default ON companies(user_id) WHERE is_default = true;

-- 2. Link recoverable_invoices to a company. Nullable so existing rows survive
-- the migration; we backfill after the column exists.
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ri_company ON recoverable_invoices(user_id, company_id);

-- 3. Backfill: for every user who already has recoverable_invoice_settings,
-- create a "Contrast" company (idempotent — only if none exists yet) from
-- those values, mark it default, and point existing invoices at it.
DO $$
DECLARE
  s RECORD;
  cid UUID;
BEGIN
  FOR s IN SELECT * FROM recoverable_invoice_settings LOOP
    -- Skip users who already have a company (re-runnable safely).
    IF EXISTS (SELECT 1 FROM companies WHERE user_id = s.user_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO companies (
      user_id, name, is_default,
      address, gstin, phone, email,
      bank_account_name, bank_account_number, bank_ifsc, bank_name,
      invoice_prefix, next_invoice_number, cgst_rate, sgst_rate, hsn_sac,
      payment_terms, terms_conditions
    ) VALUES (
      s.user_id,
      COALESCE(NULLIF(s.company_name, ''), 'Contrast'),
      true,
      s.company_address, s.company_gstin, s.company_phone, s.company_email,
      s.bank_account_name, s.bank_account_number, s.bank_ifsc, s.bank_name,
      s.invoice_prefix, s.next_invoice_number, s.cgst_rate, s.sgst_rate, s.hsn_sac,
      s.payment_terms, s.terms_conditions
    )
    RETURNING id INTO cid;

    -- Link the user's existing invoices (those without company_id) to it.
    UPDATE recoverable_invoices
       SET company_id = cid
     WHERE user_id = s.user_id AND company_id IS NULL;
  END LOOP;
END $$;
