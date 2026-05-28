-- ── Migration v18: Add is_contrast_billed flag to transactions ────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_contrast_billed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_transactions_contrast_billed ON transactions(user_id, is_contrast_billed)
  WHERE is_contrast_billed = TRUE;
