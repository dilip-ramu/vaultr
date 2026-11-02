-- ─────────────────────────────────────────────────────────────────────────────
-- v125 — Cut-off date and ETD on purchase orders
--
-- A purchase order carries two dates that no other document does: the cut-off
-- date (the last day the vendor may accept the order or change it) and the ETD
-- (estimated date of despatch). Until now they went into the notes box, where
-- they print as prose and nothing can read them back — you cannot sort by
-- them, you cannot see which orders are about to lapse, and a reader has to
-- find them inside a paragraph.
--
-- Both nullable, on `documents` rather than a side table: they belong to the
-- one document, every document already loads its own row, and a side table
-- would cost a join on every print for two dates.
--
-- `date`, not text, so the database is what refuses '2026-13-45'.
--
-- Only purchase orders use them today (see lib/documents/extraDates.ts); the
-- columns are harmless on every other type and stay NULL there.
--
-- ROLLBACK
--   ALTER TABLE documents DROP COLUMN IF EXISTS cutoff_date;
--   ALTER TABLE documents DROP COLUMN IF EXISTS etd;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE documents ADD COLUMN IF NOT EXISTS cutoff_date date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS etd date;

COMMENT ON COLUMN documents.cutoff_date IS 'Purchase orders: last date the order can be accepted or changed.';
COMMENT ON COLUMN documents.etd IS 'Purchase orders: estimated date of despatch.';

NOTIFY pgrst, 'reload schema';
