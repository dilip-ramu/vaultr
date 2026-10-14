-- ─────────────────────────────────────────────────────────────────────────────
-- v122 — What time the auction starts
--
-- The auction notice has always carried a time, and it was the string
-- '6:30 PM', typed into the code. One number for every group, in every month,
-- whatever the group actually does. A notice that states the wrong time is
-- worse than one that states none: members turn up when it says.
--
-- So the time becomes a property of the group, beside the day of the month it
-- already has. Nullable, because a group that has not settled on a time should
-- send a notice with no time line rather than a made-up one.
--
-- Stored as `time`, not text: '18:30' is a time, and the database should be the
-- thing that refuses '25:99'.
--
-- ROLLBACK
--   ALTER TABLE chit_groups DROP COLUMN IF EXISTS auction_time;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE chit_groups ADD COLUMN IF NOT EXISTS auction_time time;

-- Existing groups get the time the notice has been claiming all along, so
-- nothing changes for members who have already been told 6:30. Change any group
-- that meets at another time on its own page.
UPDATE chit_groups SET auction_time = '18:30' WHERE auction_time IS NULL;

NOTIFY pgrst, 'reload schema';
