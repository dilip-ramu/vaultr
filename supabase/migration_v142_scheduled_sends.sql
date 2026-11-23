-- v142 — send one message to one group, at a date and time you choose
--
-- WHY
--
-- 'Send one now' goes to every active group, which is right for 'the office is
-- shut on Friday' and wrong for everything else: testing on one group,
-- messaging the group whose auction moved, or writing to a single member.
--
-- And a notice is often known days before it should go out. Writing it now and
-- having it leave at six in the evening is the difference between a reminder
-- and a note-to-self.
--
-- ── WHY A TABLE AND NOT A CRON PER MESSAGE ──────────────────────────────────
--
-- A queue of rows can be read, cancelled and re-read. Each row is sent at most
-- once: 'queued' becomes 'sent' or 'failed' in the same statement that claims
-- it, so two runs overlapping cannot both send it.
--
-- Re-runnable.

CREATE TABLE IF NOT EXISTS chit_scheduled_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which message, from the one library (v137).
  template_id UUID NOT NULL REFERENCES chit_message_templates(id) ON DELETE CASCADE,

  -- 'all' every active group · 'group' one of them · 'member' one person.
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'group', 'member')),
  group_id UUID REFERENCES chit_groups(id) ON DELETE CASCADE,
  member_id UUID REFERENCES chit_members(id) ON DELETE CASCADE,

  -- When it should leave. Stored as an instant, so no reader has to guess a
  -- timezone; the screen shows it in local time.
  send_at TIMESTAMPTZ NOT NULL,

  -- 'sending' is the claim: a runner moves a row into it before doing any
  -- work, and only from 'queued'. Two runs overlapping cannot both send the
  -- same row, because the second one's claim updates no rows.
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  -- What happened: 'sent to 18, 2 skipped', or why not.
  result TEXT,
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The runner asks one question — what is due? — so that is the index.
CREATE INDEX IF NOT EXISTS idx_chit_sched_due
  ON chit_scheduled_sends(send_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_chit_sched_user
  ON chit_scheduled_sends(user_id, send_at DESC);

ALTER TABLE chit_scheduled_sends ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_scheduled_sends' AND policyname = 'Users can CRUD own scheduled sends'
  ) THEN
    CREATE POLICY "Users can CRUD own scheduled sends" ON chit_scheduled_sends
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
