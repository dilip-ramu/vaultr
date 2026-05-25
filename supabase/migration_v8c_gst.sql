-- Migration v8c: GST compliance fields for supplier_invoices
-- Run once. All columns have safe defaults for existing rows.

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS gstin_supplier    TEXT,
  ADD COLUMN IF NOT EXISTS gstin_customer    TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply   TEXT,
  ADD COLUMN IF NOT EXISTS is_igst           BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cgst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reverse_charge    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hsn_sac_code      TEXT;
