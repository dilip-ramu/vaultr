-- ── Migration v41: drop the billing/expended forex split ─────────────────────
-- The app now uses a single market rate for all foreign-currency conversions.
-- These columns only ever held rate *configuration* (not transaction data), so
-- dropping them does not touch any transaction or balance. Existing transactions
-- keep their already-stored INR amount and exchange_rate_used untouched.

ALTER TABLE currency_rates
  DROP COLUMN IF EXISTS expended_rate,
  DROP COLUMN IF EXISTS billing_rate,
  DROP COLUMN IF EXISTS expended_pct,
  DROP COLUMN IF EXISTS billing_pct;
