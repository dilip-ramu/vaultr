-- v139 — what a message does when a detail has never been filled in
--
-- WHY
--
-- Until now a message with a missing detail was always held back, and what was
-- missing went into the log. That is right for a reminder: 'Rs missing is due'
-- is worse than no reminder at all.
--
-- It is wrong for the message whose whole purpose is to get the detail out of
-- the member. 'Please confirm your account number: missing' is exactly what
-- should go out, because the member is the only person who can fix it.
--
-- So it becomes a choice, per message:
--
--   hold  keep it back and record what was missing          (the default)
--   fill  send it with the word 'missing' in that place
--
-- A blank was never an option: Meta rejects an empty variable outright.
--
-- Re-runnable.

ALTER TABLE chit_message_templates
  ADD COLUMN IF NOT EXISTS on_missing TEXT NOT NULL DEFAULT 'hold';

NOTIFY pgrst, 'reload schema';
