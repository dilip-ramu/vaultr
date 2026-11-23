-- v140 — which details may go out as 'missing', decided once per detail
--
-- SUPERSEDES v139. That migration put the choice on each MESSAGE
-- (chit_message_templates.on_missing). Wrong level: whether a gap can be shown
-- to a member is a property of the DETAIL. An account number is either
-- something this business is happy to ask for in the open or it is not, and
-- that does not change between the notice and the reminder.
--
-- v139's column is left in place and simply no longer read. Nothing is
-- destroyed, so this is reversible.
--
-- WHY
--
-- A message with a gap in it was always held back, and only the log said
-- which detail was missing. That is right for an amount or a date — 'Rs
-- missing is due on missing' is worse than no message at all — and wrong for
-- a detail only the member can fix. 'Please confirm your account number:
-- missing' is exactly what should go out, because the member is the only
-- person who can answer it.
--
-- The decision belongs to the DETAIL, not to the message: an account number is
-- either something this business is happy to ask for in the open, or it is
-- not, and that does not change between the notice and the reminder.
--
-- So: a map of {field: 'fill'} holding only the exceptions. Anything not named
-- holds the message back, which is the answer that cannot do harm, and the
-- held message is RE-TRIED every day until the detail is filled in — see the
-- 'held' rows in chit_message_log.
--
-- Re-runnable.

ALTER TABLE chit_settings
  ADD COLUMN IF NOT EXISTS missing_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A message that is waiting for a detail is not a message that failed. It
-- keeps its row — one per auction, member and step, as the unique index
-- demands — and that row is updated in place when it finally goes out.
COMMENT ON COLUMN chit_settings.missing_policy IS
  'Field ids this business is happy to send as the word "missing". Anything absent holds the message and is retried daily.';

NOTIFY pgrst, 'reload schema';
