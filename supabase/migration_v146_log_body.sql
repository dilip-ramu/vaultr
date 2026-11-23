-- v146 — what was actually said, on both sides
--
-- WHY
--
-- The log recorded WHICH message went out, never the words. That was enough
-- for 'did the reminder go?' and useless for the thing a chit operator
-- actually does: look at a conversation with one member and see what was said
-- to them and what they said back.
--
-- A template's words are not fixed either — the same reminder reads
-- differently for every member, because the figures are theirs. So the
-- rendered text is stored as it was sent.
--
-- Re-runnable.

ALTER TABLE chit_message_log
  -- The words as that member received them, figures and all.
  ADD COLUMN IF NOT EXISTS body TEXT;

CREATE INDEX IF NOT EXISTS idx_chit_msg_member_time
  ON chit_message_log(member_id, sent_at DESC);

NOTIFY pgrst, 'reload schema';
