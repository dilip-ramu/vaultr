-- ── Migration v19: Contrast billing categories + invoices ─────────────────────

-- Reusable billing categories for Contrast expense grouping
CREATE TABLE IF NOT EXISTS contrast_billing_categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
ALTER TABLE contrast_billing_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own contrast billing categories"
  ON contrast_billing_categories FOR ALL USING (auth.uid() = user_id);

-- Seed common categories (user will add their own too)
-- (These are inserted per-user on first use in the app, not here)

-- Add billing category reference to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS contrast_billing_category_id UUID
    REFERENCES contrast_billing_categories(id) ON DELETE SET NULL;

-- Contrast invoices
CREATE TABLE IF NOT EXISTS contrast_invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL,
  invoice_month    TEXT NOT NULL,  -- "YYYY-MM"
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  subtotal         DECIMAL(15,2) NOT NULL DEFAULT 0,
  gst_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  total            DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  finalized_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE contrast_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own contrast invoices"
  ON contrast_invoices FOR ALL USING (auth.uid() = user_id);

-- Line items stored for the invoice (snapshot at time of generation)
CREATE TABLE IF NOT EXISTS contrast_invoice_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES contrast_invoices(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('salary','courier','expense')),
  description     TEXT NOT NULL,
  salary_euro     DECIMAL(10,4),   -- for salary lines
  expended_rate   DECIMAL(10,4),   -- for salary lines
  amount_inr      DECIMAL(15,2) NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Track which transactions/payroll months were billed against which invoice
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS contrast_invoice_id UUID
    REFERENCES contrast_invoices(id) ON DELETE SET NULL;

ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS contrast_invoice_id UUID
    REFERENCES contrast_invoices(id) ON DELETE SET NULL;

-- Bills (courier charges) linkage
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS contrast_invoice_id UUID
    REFERENCES contrast_invoices(id) ON DELETE SET NULL;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_transactions_contrast_invoice
  ON transactions(user_id, contrast_invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contrast_billing_cat
  ON transactions(user_id, contrast_billing_category_id);
