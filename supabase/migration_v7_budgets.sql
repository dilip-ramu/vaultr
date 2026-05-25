-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'weekly', 'yearly')),
  rollover BOOLEAN NOT NULL DEFAULT FALSE,
  rollover_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  month INT CHECK (month BETWEEN 1 AND 12),
  year INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category_id, period, month, year)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own budgets" ON budgets
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON budgets TO authenticated;
GRANT SELECT ON budgets TO anon;
