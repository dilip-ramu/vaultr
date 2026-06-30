-- ── Migration v45: Per-sender role flags ─────────────────────────────────────
-- monitored_senders had a single `kind` column (TEXT: 'document' | 'bank_alert')
-- so each sender belonged to exactly one inbox. We now want a single sender
-- (e.g. alerts@hdfcbank.net) to optionally feed BOTH the supplier-document
-- inbox AND the transaction-alert inbox. Switch to two boolean flags.
--
-- The existing `kind` column is preserved for backward compatibility — any
-- code path that still reads it continues to work — but new code reads/writes
-- is_document / is_bank_alert.

ALTER TABLE monitored_senders
  ADD COLUMN IF NOT EXISTS is_document   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bank_alert BOOLEAN NOT NULL DEFAULT false;

-- Backfill the boolean flags from the legacy kind column. Re-runnable safely.
UPDATE monitored_senders SET is_document   = true WHERE kind = 'document'   AND is_document   = false;
UPDATE monitored_senders SET is_bank_alert = true WHERE kind = 'bank_alert' AND is_bank_alert = false;

-- Useful indexes for the filtered queries each inbox runs.
CREATE INDEX IF NOT EXISTS idx_ms_user_doc   ON monitored_senders(user_id) WHERE is_document   = true;
CREATE INDEX IF NOT EXISTS idx_ms_user_alert ON monitored_senders(user_id) WHERE is_bank_alert = true;
