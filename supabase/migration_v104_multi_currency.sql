-- ── Migration v104: money in more than one currency ─────────────────────────
--
-- Accounts already carry a currency, but nothing respected it. The balance view
-- credits a transfer with the SAME number it debits:
--
--     WHEN t.type = 'transfer' AND t.account_id    = a.id THEN -t.amount
--     WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN  t.amount
--
-- Move ₹90,000 into a EUR account and it credits €90,000. Not "unsupported" —
-- silently, catastrophically wrong. So the first thing to fix is the transfer.
--
-- A cross-currency transfer is TWO amounts:
--     amount     what LEFT the source, in the source's currency   (₹90,000)
--     to_amount  what ARRIVED at the destination, in its currency (€1,000)
--
-- to_amount is NULL for every ordinary same-currency transfer, which is why this
-- is safe: COALESCE(to_amount, amount) reproduces today's behaviour exactly for
-- every existing row. Nothing is restated.

ALTER TABLE transactions
  -- What actually landed, in the destination account's currency.
  ADD COLUMN IF NOT EXISTS to_amount NUMERIC(15, 2),
  -- The rate you actually got (destination units per source unit). Stored, not
  -- derived: your bank's rate on the day is a fact, and it is never the market
  -- rate. Without it a transfer is unreconstructable a year later.
  ADD COLUMN IF NOT EXISTS fx_rate   NUMERIC(18, 8);

COMMENT ON COLUMN transactions.to_amount IS
  'Cross-currency transfers: the amount received, in the destination account''s currency. NULL when both sides share a currency.';

-- The balance view must credit what ARRIVED, not what left.
-- (The view lists columns explicitly; CREATE OR REPLACE requires the same column
--  order, so this is the v73 view with exactly one line changed.)
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id, a.user_id, a.household_id, a.created_by, a.name, a.type, a.currency,
  a.color, a.icon, a.include_in_net_worth, a.is_active, a.created_at,
  a.initial_balance, a.avatar_url, a.account_number, a.branch, a.ifsc_code,
  a.swift_code, a.bank_address, a.open_date, a.closing_date, a.statement_day,
  a.statement_due_day, a.credit_limit, a.loan_principal, a.interest_rate,
  a.emi_amount, a.custom_type_id,
  ct.name       AS custom_type_name,
  ct.color      AS custom_type_color,
  ct.icon       AS custom_type_icon,
  ct.avatar_url AS custom_type_avatar_url,
  a.last_reconciled_at,
  a.last_reconciled_balance,
  a.initial_balance +
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income'   THEN  t.amount
        WHEN t.type = 'expense'  THEN -t.amount
        WHEN t.type = 'transfer' AND t.account_id    = a.id THEN -t.amount
        -- CHANGED: credit what arrived. COALESCE keeps every existing
        -- same-currency transfer behaving exactly as it does today.
        WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN  COALESCE(t.to_amount, t.amount)
        ELSE 0
      END
    ), 0) AS balance,
  COUNT(t.id) AS transaction_count,
  a.account_holder,
  a.card_network,
  a.card_expiry_month,
  a.card_expiry_year
FROM accounts a
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;

GRANT SELECT ON account_balances TO authenticated;
GRANT SELECT ON account_balances TO anon;

NOTIFY pgrst, 'reload schema';

-- Sanity: any cross-currency transfer already in the data is WRONG and should be
-- corrected by re-entering it. This finds them.
--   SELECT t.id, t.date, t.amount, src.currency AS from_ccy, dst.currency AS to_ccy
--     FROM transactions t
--     JOIN accounts src ON src.id = t.account_id
--     JOIN accounts dst ON dst.id = t.to_account_id
--    WHERE t.type = 'transfer'
--      AND src.currency <> dst.currency
--      AND t.to_amount IS NULL;
