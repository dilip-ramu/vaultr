-- ─────────────────────────────────────────────────────────────────────────────
-- v123 — Who recorded it
--
-- With one person running the chit, "who entered this?" never came up. With
-- partners, collectors and several groups running at once, it is the first
-- question asked about anything that looks wrong — and the books could not
-- answer it. A row said what happened and when; it did not say who.
--
-- TWO COLUMNS, AND WHY THE SECOND ONE IS NOT A MISTAKE
--
--   recorded_by_user_id  who it was, as an id. The fact.
--   recorded_by_name     who it was, as a name, copied in at the time.
--
-- The name is denormalised on purpose. This is a historical record: if an
-- admin's access is removed a year from now, every collection they took must
-- still say they took it. A join to a live table would quietly turn those rows
-- into "unknown" exactly when somebody is trying to work out what happened.
--
-- Existing rows get nothing. Backfilling them with the owner would be inventing
-- evidence — they genuinely predate the question, and "—" is the honest answer.
--
-- ROLLBACK
--   ALTER TABLE chit_collections DROP COLUMN IF EXISTS recorded_by_user_id,
--                                DROP COLUMN IF EXISTS recorded_by_name;
--   ALTER TABLE chit_auctions    DROP COLUMN IF EXISTS recorded_by_user_id,
--                                DROP COLUMN IF EXISTS recorded_by_name;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE chit_collections
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_by_name    text;

ALTER TABLE chit_auctions
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_by_name    text;

CREATE INDEX IF NOT EXISTS chit_collections_recorded_by_idx
  ON chit_collections (user_id, recorded_by_user_id);

NOTIFY pgrst, 'reload schema';
