-- v137 — the message templates become a library you can add to
--
-- WHY
--
-- v135 put one row per message KIND per user, with a unique index to enforce
-- it: four templates, and exactly four. That was wrong in two ways.
--
--   1. A chit operator wants as many messages as the chit needs — three
--      reminders worded differently, a separate notice for the first month, a
--      message asking the winner to confirm their bank account. The unique
--      index made a second reminder impossible.
--
--   2. The variables were fixed in code per kind, so a message could not carry
--      a detail its kind had not been written for. They are now written into
--      the wording as {{member_name}}, {{days_overdue}} and so on, and
--      lib/chit/messageFields.ts is the only place that knows what each means.
--
-- Still ONE LIBRARY FOR EVERY GROUP, which is the point: the notice is written
-- once, and each group's schedule chooses which message goes out and when.
--
-- Re-runnable. Nothing is dropped except the index that limited the count.

-- A second reminder is not a conflict. It is a second reminder.
DROP INDEX IF EXISTS idx_chit_tpl_kind;

ALTER TABLE chit_message_templates
  -- What you call it in the schedule: 'Auction notice', 'Second reminder'.
  ADD COLUMN IF NOT EXISTS label TEXT,
  -- 'all' | 'winner' | 'unpaid'. Decides which details it may use: a bid
  -- amount exists only for the winner, a day count only for somebody who owes.
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all',
  -- Kept, but out of the way. An archived message cannot be scheduled.
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Anything written under v136 keeps working: its kind becomes its name.
UPDATE chit_message_templates
   SET label = COALESCE(NULLIF(TRIM(label), ''), INITCAP(REPLACE(kind, '_', ' ')))
 WHERE label IS NULL OR TRIM(label) = '';

-- Which messages are for whom, for the rows v136 left behind.
UPDATE chit_message_templates SET audience = 'winner'
 WHERE audience = 'all' AND kind = 'winner';
UPDATE chit_message_templates SET audience = 'unpaid'
 WHERE audience = 'all' AND kind IN ('reminder', 'reminder_overdue');

-- ── When the subscription falls due ─────────────────────────────────────────
--
-- 'Overdue by 12 days' has to be counted from somewhere. Until now the app
-- used the next auction date, which means nothing is ever overdue until the
-- month is finished — so an overdue reminder could never fire. This is the
-- number of days after the auction that the subscription is owed.
--
-- NULL keeps the old behaviour: owed by the next auction at the latest.
ALTER TABLE chit_groups
  ADD COLUMN IF NOT EXISTS dues_due_days INTEGER;

NOTIFY pgrst, 'reload schema';
