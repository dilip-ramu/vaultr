-- migration_v29: default transaction category per supplier
-- When a supplier invoice is marked as paid, the created transaction
-- will automatically use this category.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_default_category
  ON suppliers(default_category_id)
  WHERE default_category_id IS NOT NULL;
