-- Migration v24: Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    UUID REFERENCES households(id) ON DELETE SET NULL,
  category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount          DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  period          TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (period IN ('monthly', 'weekly', 'yearly')),
  rollover        BOOLEAN NOT NULL DEFAULT FALSE,
  rollover_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  month           INTEGER CHECK (month BETWEEN 1 AND 12),
  year            INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One budget per category per period per month/year per user
  UNIQUE (user_id, category_id, period, month, year)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own budgets"
  ON budgets FOR ALL USING (auth.uid() = user_id);
