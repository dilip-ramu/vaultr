-- ── Migration v14: Payroll Module ─────────────────────────────────────────

-- ── employees ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id    TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  designation    TEXT,
  salary_euro    DECIMAL(10,2) NOT NULL DEFAULT 0,
  account_number TEXT,
  ifsc           TEXT,
  bank_name      TEXT,
  branch         TEXT,
  pan_number     TEXT,
  upi_id         TEXT,
  joining_date   DATE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, employee_id)
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_select" ON employees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emp_insert" ON employees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emp_update" ON employees FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "emp_delete" ON employees FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON employees TO authenticated;
GRANT ALL ON employees TO anon;

-- ── payroll_months ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_months (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payroll_month     TEXT        NOT NULL,           -- "2024-05"
  payment_date      DATE,
  billed_euros      DECIMAL(10,2) NOT NULL DEFAULT 0,
  received_inr      DECIMAL(14,2) NOT NULL DEFAULT 0,
  bank_charges      DECIMAL(10,2) NOT NULL DEFAULT 0,
  effective_rate    DECIMAL(10,4) NOT NULL DEFAULT 0,
  expended_rate     DECIMAL(10,4) NOT NULL DEFAULT 0,
  is_finalized      BOOLEAN     NOT NULL DEFAULT FALSE,
  finalized_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, payroll_month)
);

ALTER TABLE payroll_months ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_select" ON payroll_months FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pm_insert" ON payroll_months FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pm_update" ON payroll_months FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pm_delete" ON payroll_months FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON payroll_months TO authenticated;
GRANT ALL ON payroll_months TO anon;

-- ── payroll_entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payroll_month_id UUID        NOT NULL REFERENCES payroll_months(id) ON DELETE CASCADE,
  employee_id      UUID        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  salary_euro      DECIMAL(10,2) NOT NULL,
  expended_rate    DECIMAL(10,4) NOT NULL,
  salary_inr       DECIMAL(14,2) NOT NULL,
  allowances       DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime         DECIMAL(10,2) NOT NULL DEFAULT 0,
  incentives       DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions       DECIMAL(10,2) NOT NULL DEFAULT 0,
  advance          DECIMAL(10,2) NOT NULL DEFAULT 0,
  final_payable    DECIMAL(14,2) NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pe_select" ON payroll_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pe_insert" ON payroll_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pe_update" ON payroll_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pe_delete" ON payroll_entries FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON payroll_entries TO authenticated;
GRANT ALL ON payroll_entries TO anon;

-- ── salary_slips ────────────────────────────────────────────────────────────
-- Tracks which entries have had slips generated; PDFs are rendered on-demand.
-- Stage 2 bank_csv_exports table is scaffolded below for future use.
CREATE TABLE IF NOT EXISTS salary_slips (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payroll_entry_id UUID        NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ss_select" ON salary_slips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ss_insert" ON salary_slips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ss_delete" ON salary_slips FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON salary_slips TO authenticated;
GRANT ALL ON salary_slips TO anon;

-- ── Stage 2 placeholder: bulk bank CSV export ──────────────────────────────
-- DO NOT remove. Architecture reserved for future bank-upload CSV generation.
-- CREATE TABLE IF NOT EXISTS bank_csv_exports (
--   id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   payroll_month_id UUID NOT NULL REFERENCES payroll_months(id) ON DELETE CASCADE,
--   generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   row_count        INT NOT NULL DEFAULT 0
-- );
