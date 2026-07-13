-- v106 — Grand net worth: ownership stake + owner loans
--
-- Two additive changes. Nothing is dropped, nothing is rewritten, no existing
-- number changes until you actually set a stake below 100%.
--
--   1. companies.ownership_pct — how much of this company is YOURS.
--      Defaults to 100, which is what every existing company effectively is
--      today, so this migration cannot move any figure on its own.
--
--   2. owner_loans — money you personally put INTO a company, or took OUT of it.
--      This is the one thing that cannot be derived: a transfer from your
--      personal account to the company's looks identical to a dozen other
--      things, and guessing would be worse than asking.
--
-- Why the loan matters, arithmetically: lending your company ₹1L is a
-- receivable to YOU and a payable inside the COMPANY. At 100% ownership those
-- cancel to zero — correct, you only moved your own money between pockets. At
-- 60% you're left +₹40k, because your partners now bear 40% of that debt. The
-- net worth calculation only gets that right if the loan is booked on BOTH
-- sides, which is exactly why it lives in one table used by both.
--
-- ── To revert ───────────────────────────────────────────────────────────────
--   ALTER TABLE companies DROP COLUMN IF EXISTS ownership_pct;
--   DROP TABLE IF EXISTS owner_loans;
-- Nothing else in the app reads either, so reverting restores the previous
-- behaviour exactly.

-- 1. Your stake ─────────────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ownership_pct numeric(5,2) NOT NULL DEFAULT 100;

DO $$
BEGIN
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_ownership_pct_check;
  -- 0 is legal (a company you've fully exited but keep for its history);
  -- above 100 is not a thing.
  ALTER TABLE companies ADD CONSTRAINT companies_ownership_pct_check
    CHECK (ownership_pct >= 0 AND ownership_pct <= 100);
END $$;

COMMENT ON COLUMN companies.ownership_pct IS
  'Your share of this company, 0-100. Applied to EQUITY (assets + cash + receivables - debt - payables), never to individual lines.';

-- 2. Owner loans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_loans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 'lent'     = you put money INTO the company  (company owes you)
  -- 'repaid'   = the company gave it back        (reduces what it owes you)
  -- 'drawn'    = you took money OUT of the company, not as salary (you owe it)
  -- 'returned' = you put that back               (reduces what you owe it)
  direction     text NOT NULL CHECK (direction IN ('lent', 'repaid', 'drawn', 'returned')),

  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  date          date NOT NULL DEFAULT CURRENT_DATE,
  note          text,

  -- The bank movement this loan entry corresponds to, when there was one. The
  -- money leaving your account is ALREADY counted in your personal cash; the
  -- loan entry is the claim it created, not a second pile of money. Linking
  -- them makes that traceable instead of merely asserted.
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_loans_user_company_idx ON owner_loans (user_id, company_id);

ALTER TABLE owner_loans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "owner_loans_own_rows" ON owner_loans;
  CREATE POLICY "owner_loans_own_rows" ON owner_loans
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

COMMENT ON TABLE owner_loans IS
  'Money you personally lent to / drew from a company. Net balance = lent - repaid - drawn + returned. Positive = the company owes you; it is a receivable to you AND a payable inside the company, and must be counted on both sides or the group books do not balance.';
