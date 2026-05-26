ALTER TABLE customers ADD COLUMN IF NOT EXISTS city        TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state       TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state_code  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pincode     TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country     TEXT DEFAULT 'India';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS csv_alias   TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_csv_alias ON customers(user_id, csv_alias);
