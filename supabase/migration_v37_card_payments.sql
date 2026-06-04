-- ── Migration v37: pay/unpay credit card statements ──────────────────────────
-- 1. bank_amount becomes optional — a statement row can now exist purely to
--    track the payment transaction (you may pay before entering the bank's figure).
-- 2. payment_transaction_id links the statement to the transfer transaction the
--    Pay button creates, so "mark unpaid" can delete exactly that transaction.

ALTER TABLE card_statements
  ALTER COLUMN bank_amount DROP NOT NULL;

ALTER TABLE card_statements
  ADD COLUMN IF NOT EXISTS payment_transaction_id UUID
  REFERENCES transactions(id) ON DELETE SET NULL;
