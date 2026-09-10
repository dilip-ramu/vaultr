-- ─────────────────────────────────────────────────────────────────────────────
-- v119 — Chit members: a member number, bank details, and a referring member
--
-- WHAT THIS ADDS
--   member_code            A human number, e.g. UC00001. Editable, and unique
--                          per user — two members sharing a number would make
--                          every paper record ambiguous.
--   bank_*                 Where this member is PAID their prize money. Kept on
--                          the member, not shared with company billing accounts:
--                          these are other people's accounts.
--   referred_by_member_id  Who introduced them. A real link to another member,
--                          not a name typed into a box, so "who did Suresh
--                          bring in" is a query rather than a memory.
--
-- Existing members are backfilled with codes in the order they were created, so
-- nothing is left blank and the numbering matches the joining order.
--
-- ROLLBACK
--   ALTER TABLE chit_members
--     DROP COLUMN IF EXISTS member_code,
--     DROP COLUMN IF EXISTS bank_name, DROP COLUMN IF EXISTS bank_account_name,
--     DROP COLUMN IF EXISTS bank_account_number, DROP COLUMN IF EXISTS bank_ifsc,
--     DROP COLUMN IF EXISTS bank_branch,
--     DROP COLUMN IF EXISTS referred_by_member_id;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS member_code           text,
  ADD COLUMN IF NOT EXISTS bank_name             text,
  ADD COLUMN IF NOT EXISTS bank_account_name     text,
  ADD COLUMN IF NOT EXISTS bank_account_number   text,
  ADD COLUMN IF NOT EXISTS bank_ifsc             text,
  ADD COLUMN IF NOT EXISTS bank_branch           text,
  ADD COLUMN IF NOT EXISTS referred_by_member_id uuid
    REFERENCES chit_members(id) ON DELETE SET NULL;

-- ── Backfill: UC00001 upwards, in joining order ─────────────────────────────
-- Only members that have no code yet, so re-running changes nothing.
WITH numbered AS (
  SELECT id,
         'UC' || lpad((row_number() OVER (PARTITION BY user_id ORDER BY created_at, id))::text, 5, '0') AS code
    FROM chit_members
   WHERE member_code IS NULL
)
UPDATE chit_members m
   SET member_code = n.code
  FROM numbered n
 WHERE n.id = m.id;

-- ── One number, one member ──────────────────────────────────────────────────
-- Partial, so a member may temporarily have no code without blocking others.
CREATE UNIQUE INDEX IF NOT EXISTS chit_members_code_unique
  ON chit_members (user_id, upper(member_code)) WHERE member_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS chit_members_referred_by_idx
  ON chit_members (referred_by_member_id) WHERE referred_by_member_id IS NOT NULL;

-- A member cannot introduce themselves. Cheap to state, awkward to discover.
ALTER TABLE chit_members DROP CONSTRAINT IF EXISTS chit_members_referrer_not_self;
ALTER TABLE chit_members ADD CONSTRAINT chit_members_referrer_not_self
  CHECK (referred_by_member_id IS NULL OR referred_by_member_id <> id);

NOTIFY pgrst, 'reload schema';
