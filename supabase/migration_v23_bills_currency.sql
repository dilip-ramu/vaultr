-- Migration v23: Add multi-currency support to bills table
ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_amount   DECIMAL(15, 2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(15, 6);
