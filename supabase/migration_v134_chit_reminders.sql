-- v134 — chit reminder schedules, and a log of what was sent
--
-- WHY
--
-- Six messages hang off each auction: the notice before it, the dues and the
-- winner's particulars on the day, and three payment reminders after. Sending
-- them by hand means remembering six dates per group per month and working out
-- each time who has already paid.
--
-- The GROUP carries the schedule. A MEMBER may carry their own, which replaces
-- the group's rather than merging with it — some members need more pushing,
-- and two schedules layered on each other cannot be reasoned about when a
-- message goes out at the wrong time.
--
-- chit_message_log is what stops anybody being messaged twice. Its key is
-- auction + member + step, unique, so a reminder run is safe to repeat. It is
-- also where a WhatsApp message id and its delivery state will go when the
-- Cloud API is wired in; until then the channel is the click-to-chat link.
--
-- Re-runnable.

-- The group's own schedule. NULL means 'the app's defaults', so nothing has to
-- be written before the first auction.
ALTER TABLE chit_groups
  ADD COLUMN IF NOT EXISTS reminder_steps JSONB;

-- A member's override. NULL means 'follow the group', which is almost everyone.
ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS reminder_steps JSONB;

CREATE TABLE IF NOT EXISTS chit_message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,
  -- Which auction this belonged to: a new month sends again.
  auction_id UUID REFERENCES chit_auctions(id) ON DELETE CASCADE,
  -- The step within that month: 'notice', 'dues', 'remind-1'.
  step_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  -- 'link' while messages go out through click-to-chat; 'whatsapp' once the
  -- Cloud API is registered.
  channel TEXT NOT NULL DEFAULT 'link',
  status TEXT NOT NULL DEFAULT 'sent',
  -- Meta's message id, and what it reported back. Unused until the API lands.
  provider_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The rule, in the schema rather than in the code: one send per member per
-- step per auction. A repeat run cannot message anybody twice even if the
-- application layer is wrong.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chit_msg_once
  ON chit_message_log(auction_id, member_id, step_key)
  WHERE auction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chit_msg_group ON chit_message_log(group_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chit_msg_member ON chit_message_log(member_id, sent_at DESC);

ALTER TABLE chit_message_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_message_log' AND policyname = 'Users can CRUD own chit message log'
  ) THEN
    CREATE POLICY "Users can CRUD own chit message log" ON chit_message_log
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
