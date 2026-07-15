-- v107 — Chit fund management
--
-- A self-contained subsystem. Six new tables, all prefixed chit_, none of which
-- touch an existing table's columns — so nothing already in the app can break,
-- and reverting is a clean DROP of exactly these six.
--
-- ── How it hangs off what already exists ────────────────────────────────────
--
-- A chit GROUP belongs to a Vaultr COMPANY (chit_groups.company_id → companies).
-- That's the whole integration: the company already has bank accounts tagged to
-- it, so a collection posts an INCOME transaction to one of them and a payout an
-- EXPENSE. Chit money then flows into net worth, Books and the per-company view
-- for free.
--
-- Chit MEMBERS are their OWN roster (chit_members), NOT your billing customers —
-- they carry Aadhaar, PAN, nominees, guarantors and securities that have no place
-- on an invoice customer.
--
-- ── To revert ───────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS chit_collections, chit_receivables, chit_auctions,
--     chit_group_members, chit_groups, chit_members CASCADE;
-- Nothing else references them, so this restores the previous behaviour exactly.

-- ── Members ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name          text NOT NULL,
  -- Stored as the 10-digit canonical form (strip +91 / 91 / leading 0) so the
  -- same person entered two ways is still one person for duplicate detection.
  phone         text,
  address       text,
  aadhaar       text,
  pan           text,

  -- The KYC-ish extras a chit needs and an invoice never does. Kept as JSON —
  -- these are lists of {name, phone, relation, …} and vary in shape.
  nominees      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- NOT "references" — that's a reserved SQL keyword and would need quoting
  -- everywhere. Same thing, unambiguous name.
  reference_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  guarantors    jsonb NOT NULL DEFAULT '[]'::jsonb,
  securities    jsonb NOT NULL DEFAULT '[]'::jsonb,

  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chit_members_user_idx ON chit_members (user_id);
CREATE INDEX IF NOT EXISTS chit_members_phone_idx ON chit_members (user_id, phone);

-- ── Groups ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- WHICH of your companies runs this chit. Its bank accounts receive the
  -- collections and fund the payouts. Nullable so a group can exist before you've
  -- decided, but the collection/payout flow asks for it.
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,

  name            text NOT NULL,
  chit_value      numeric(14,2) NOT NULL CHECK (chit_value > 0),
  members         integer NOT NULL CHECK (members >= 2),
  commission_pct  numeric(5,2) NOT NULL DEFAULT 5,
  bid_ceiling_pct numeric(5,2) NOT NULL DEFAULT 30,
  -- 'MONTHLY' = fixed cut every auction; 'UPFRONT' = foreman takes the first pot.
  -- See lib/chit/auction.ts — the maths lives there, this is just storage.
  commission_model text NOT NULL DEFAULT 'MONTHLY'
    CHECK (commission_model IN ('MONTHLY', 'UPFRONT')),

  auction_day     integer,          -- day of month the auction is held (1–31)
  start_date      date,
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chit_groups_user_idx ON chit_groups (user_id);
CREATE INDEX IF NOT EXISTS chit_groups_company_idx ON chit_groups (company_id);

-- ── Who is in which group ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_group_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,
  slot_number   integer,            -- their seat in the group
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A member sits in a group once. Re-adding is a no-op, not a duplicate.
  UNIQUE (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS chit_gm_group_idx ON chit_group_members (group_id);
CREATE INDEX IF NOT EXISTS chit_gm_member_idx ON chit_group_members (member_id);

-- ── Auctions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_auctions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,

  month_number    integer NOT NULL CHECK (month_number >= 1),
  auction_date    date NOT NULL DEFAULT CURRENT_DATE,
  -- Who won. Null in an UPFRONT month 1 (the foreman took the pot, no member won).
  winner_member_id uuid REFERENCES chit_members(id) ON DELETE SET NULL,

  -- All figures are what the maths produced, STORED so a later change to rates or
  -- formulas can't silently rewrite history.
  bid_amount        numeric(14,2) NOT NULL DEFAULT 0,   -- the discount, after ceiling
  commission        numeric(14,2) NOT NULL DEFAULT 0,
  net_payout        numeric(14,2) NOT NULL DEFAULT 0,   -- what the winner receives
  dividend_per_member numeric(14,2) NOT NULL DEFAULT 0,

  -- The EXPENSE transaction that paid the winner, once it's marked paid. This is
  -- the link that puts the payout in your real books. Null until paid.
  payout_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  paid_at         timestamptz,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- One auction per month per group.
  UNIQUE (group_id, month_number)
);
CREATE INDEX IF NOT EXISTS chit_auctions_group_idx ON chit_auctions (group_id);

-- ── Collections (installments received) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_collections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,

  month_number    integer NOT NULL CHECK (month_number >= 1),
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_date       date NOT NULL DEFAULT CURRENT_DATE,

  -- The INCOME transaction this collection created, and which account it landed
  -- in. This is the whole point of doing chit in-house: the money is REAL, not a
  -- number in a side ledger. Nullable because you might record a collection you
  -- haven't yet decided the account for — but the flow fills it.
  income_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  account_id      uuid REFERENCES accounts(id) ON DELETE SET NULL,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- One installment per member per month per group. A second payment for the same
  -- slot is an edit, not a new row.
  UNIQUE (group_id, member_id, month_number)
);
CREATE INDEX IF NOT EXISTS chit_collections_group_idx ON chit_collections (group_id);
CREATE INDEX IF NOT EXISTS chit_collections_member_idx ON chit_collections (member_id);

-- ── Receivables (dues) ──────────────────────────────────────────────────────
-- One row per member per month that is OWED. PENDING until paid or past due;
-- flipped to OVERDUE by the app when the due date passes. Kept as rows rather
-- than derived so "who owes what" is a plain query the dashboard can trust.
CREATE TABLE IF NOT EXISTS chit_receivables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,

  month_number    integer NOT NULL CHECK (month_number >= 1),
  amount          numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date        date,
  status          text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'OVERDUE', 'PAID')),

  collection_id   uuid REFERENCES chit_collections(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id, month_number)
);
CREATE INDEX IF NOT EXISTS chit_receivables_group_idx ON chit_receivables (group_id);
CREATE INDEX IF NOT EXISTS chit_receivables_status_idx ON chit_receivables (user_id, status);

-- ── RLS: your rows are yours, on every table ────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chit_members', 'chit_groups', 'chit_group_members',
    'chit_auctions', 'chit_collections', 'chit_receivables'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_own', t);
  END LOOP;
END $$;
