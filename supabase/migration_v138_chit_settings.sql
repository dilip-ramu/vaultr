-- v138 — one schedule for the whole chit business, not one per group
--
-- WHY
--
-- v134 put the reminder schedule on each group, which sounded flexible and is
-- in practice a maintenance trap: four groups meant the same six intervals
-- edited four times, and three of them quietly drifting. The messages were
-- already one library for every group (v137); the timing belongs at the same
-- level.
--
-- What stays per member is the OVERRIDE on chit_members.reminder_steps — one
-- rule for everybody, and a different rule for the few who need more pushing.
-- That is the shape that was asked for.
--
-- The old columns on chit_groups are LEFT IN PLACE and simply no longer read.
-- Nothing is destroyed, so this is reversible by pointing the code back at
-- them.
--
-- Re-runnable.

CREATE TABLE IF NOT EXISTS chit_settings (
  -- One row per user. The primary key says so, rather than a constraint
  -- somewhere in the application that can be forgotten.
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- When each message goes out. NULL means the app's defaults, so nothing has
  -- to be set up before the first auction.
  reminder_steps JSONB,

  -- How many days after the auction the subscription is owed. This is the date
  -- members are told and what 'overdue by 12 days' counts from. NULL means
  -- 'by the next auction', under which nothing is ever overdue.
  dues_due_days INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chit_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_settings' AND policyname = 'Users can CRUD own chit settings'
  ) THEN
    CREATE POLICY "Users can CRUD own chit settings" ON chit_settings
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Whatever was already set on a group becomes the starting point, so nobody
-- has to set their schedule up a second time. The most recently updated group
-- that carries one wins.
INSERT INTO chit_settings (user_id, reminder_steps, dues_due_days)
SELECT DISTINCT ON (user_id) user_id, reminder_steps, dues_due_days
  FROM chit_groups
 WHERE reminder_steps IS NOT NULL
 ORDER BY user_id, updated_at DESC
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
