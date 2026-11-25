-- v148 — a record of what a member changed about themselves
--
-- WHY
--
-- Members can now correct their own record from the portal: a new address, a
-- corrected account number, the nominee they have since married. That is how
-- a register stays current without the operator retyping everything.
--
-- It also means an account number can change. A payout goes to whatever is on
-- file, so a change made quietly days before an auction win is exactly the
-- thing that must not be quiet. Every change is kept with what it was before.
--
-- Nothing here is reversible by itself — it is a record, not a workflow. The
-- operator reads it and acts, which is the right division: the app should not
-- decide whether a member's own bank change is suspicious.
--
-- Re-runnable.

CREATE TABLE IF NOT EXISTS chit_member_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,

  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  -- Bank details, which decide where a payout lands.
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'member' when they did it themselves. Room for 'operator' later.
  changed_by TEXT NOT NULL DEFAULT 'member',
  -- Read by the operator.
  seen BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_changes_user
  ON chit_member_changes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_changes_member
  ON chit_member_changes(member_id, created_at DESC);

ALTER TABLE chit_member_changes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_member_changes' AND policyname = 'Users can CRUD own member changes'
  ) THEN
    CREATE POLICY "Users can CRUD own member changes" ON chit_member_changes
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
