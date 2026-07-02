-- ── Migration v68: attachments on transaction_drafts ──────────────────────
-- When a bank-alert email has a receipt/statement PDF attached, we want to
-- carry that attachment through to the final transaction on approve.
--
-- Existing `attachments` table already handles per-transaction files; this
-- migration just adds staging columns on the draft so the fetch step can
-- park the file until the user approves it. On approve, we insert into the
-- attachments table pointing at the newly-created transaction.

ALTER TABLE transaction_drafts
  ADD COLUMN IF NOT EXISTS attachment_name         TEXT,
  ADD COLUMN IF NOT EXISTS attachment_path         TEXT,   -- vaultr-attachments bucket path
  ADD COLUMN IF NOT EXISTS attachment_size         INTEGER,
  ADD COLUMN IF NOT EXISTS attachment_content_type TEXT;

NOTIFY pgrst, 'reload schema';
