-- ── Migration v50: drop monitored_senders.kind ─────────────────────────────
-- Replaced by is_document + is_bank_alert (migration v45). All code paths
-- have been migrated. Re-runnable.
ALTER TABLE monitored_senders DROP COLUMN IF EXISTS kind;
