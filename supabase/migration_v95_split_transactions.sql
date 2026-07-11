-- ── Migration v95: split transactions ───────────────────────────────────────
-- A single bank line can be split into any number of parts, each of which is a
-- FULL transaction with its own type (expense / income / transfer), category or
-- target account, and amount. The parts replace the original and all share a
-- `split_group_id` (the original transaction's id) for traceability.
--
-- Because the parts are ordinary transactions, account balances, categories,
-- reports and the double-entry Books all stay correct with zero extra logic.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_transactions_split_group ON transactions(user_id, split_group_id);
