-- v141 — replies from members, and delivery reports
--
-- WHY
--
-- A Cloud API number has no app and no inbox. A member who replies 'paid' is
-- talking to nobody. With one number for the whole chit business — which is
-- the position we are in — that is not a nicety, it is the difference between
-- a conversation and a loudspeaker.
--
-- Two things arrive at the webhook. Delivery reports update the row of the
-- message they belong to, in place: 'sent' becomes 'delivered' becomes 'read',
-- and a message that never gets past 'sent' is how a dead number announces
-- itself. Replies have nowhere to go, so they get this table.
--
-- Re-runnable.

CREATE TABLE IF NOT EXISTS chit_message_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who it is from, as far as we can tell. A number nobody recognises still
  -- gets a row: 'somebody on 98765 43210 said paid' is worth reading.
  member_id UUID REFERENCES chit_members(id) ON DELETE SET NULL,
  from_phone TEXT NOT NULL,

  -- Meta's id for their message. Unique, because Meta retries a webhook it
  -- did not get a 200 for, and the same reply must not appear twice.
  wa_message_id TEXT NOT NULL,

  body TEXT NOT NULL DEFAULT '',

  -- A guess, kept as a guess: 'paid', 'done', 'transferred'. It marks the
  -- reply for the operator to check against the collection. Nothing in the
  -- books ever moves because somebody typed a word.
  looks_paid BOOLEAN NOT NULL DEFAULT FALSE,
  -- Somebody asking not to be messaged again. Honouring this is not optional:
  -- on WhatsApp, members marking messages as spam costs delivery for everyone.
  looks_stop BOOLEAN NOT NULL DEFAULT FALSE,

  -- Read and dealt with by a person.
  handled BOOLEAN NOT NULL DEFAULT FALSE,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chit_inbox_once ON chit_message_inbox(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_chit_inbox_user ON chit_message_inbox(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_chit_inbox_member ON chit_message_inbox(member_id, received_at DESC);

ALTER TABLE chit_message_inbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_message_inbox' AND policyname = 'Users can CRUD own chit inbox'
  ) THEN
    CREATE POLICY "Users can CRUD own chit inbox" ON chit_message_inbox
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- A member who asked to be left alone. The daily run skips them, and it is a
-- column rather than a guess re-read from the inbox every morning.
ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS messaging_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

-- A REPLY BELONGS TO A PERSON, NOT TO A GROUP
--
-- Every row in the log so far was a scheduled message, which always has a
-- group and a month. A reply typed by hand has neither: it is a conversation
-- with a member who may sit in two chits. So the group becomes optional.
ALTER TABLE chit_message_log ALTER COLUMN group_id DROP NOT NULL;

-- Delivery reports arrive against the provider's message id, so it needs to be
-- findable.
CREATE INDEX IF NOT EXISTS idx_chit_msg_provider
  ON chit_message_log(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
