-- ── Migration v11: TDS & Payment Tracking ─────────────────────────────────

-- Add payment detail columns to invoices
ALTER TABLE recoverable_invoices
  ADD COLUMN IF NOT EXISTS tds_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_notes  TEXT;

-- TDS / payment entries table
CREATE TABLE IF NOT EXISTS recoverable_tds_entries (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id         UUID        REFERENCES recoverable_invoices(id) ON DELETE SET NULL,
  invoice_number     TEXT        NOT NULL,
  customer_name      TEXT        NOT NULL,
  invoice_total      DECIMAL(12,2) NOT NULL,
  paid_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  tds_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  adjustment_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  adjustment_notes   TEXT,
  account_id         UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  payment_date       DATE        NOT NULL,
  transaction_id     UUID        REFERENCES transactions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE recoverable_tds_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tds_select" ON recoverable_tds_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tds_insert" ON recoverable_tds_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tds_update" ON recoverable_tds_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tds_delete" ON recoverable_tds_entries
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON recoverable_tds_entries TO service_role;
