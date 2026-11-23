-- v133 — a category can fund an asset, and the spend can be folded into another
--
-- WHY
--
-- You own the land. You spend eighteen months buying cement, steel and labour.
-- Every bill is a transaction in a category — Construction — and none of them
-- is an expense in the ordinary sense: the money is standing in the field as a
-- wall. Tagging each bill onto the asset by hand works, and nobody does it.
--
-- So the CATEGORY carries the link, and the asset's figure is worked out from
-- the bills rather than stored beside them. Nothing to click when a
-- transaction is entered, and no second copy to drift.
--
-- A construction ends. The spend is then FOLDED onto whichever asset it
-- became, as one dated improvement, and the bucket reads zero again for the
-- next project. asset_folds remembers which bills went into each fold, so a
-- bill corrected years later can be reported rather than silently changing a
-- finished building's cost.
--
-- Re-runnable.

-- Which asset this category's spend accumulates towards. NULL for every
-- ordinary category, which is all of them until you set one.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_asset ON categories(asset_id);

CREATE TABLE IF NOT EXISTS asset_folds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The asset whose bucket was emptied.
  source_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  -- The asset it became part of.
  target_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  improvement_name TEXT NOT NULL,
  -- The day the work was finished: the improvement's own clock starts here,
  -- not when the first bill was paid.
  completed_on DATE NOT NULL,
  -- What was folded, as it stood on the day. Frozen on purpose.
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Exactly which bills went in. By id, not by date: a bill entered late but
  -- dated before the fold must stay in the new bucket, not be swallowed.
  transaction_ids UUID[] NOT NULL DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE asset_folds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'asset_folds' AND policyname = 'Users can CRUD own asset folds'
  ) THEN
    CREATE POLICY "Users can CRUD own asset folds" ON asset_folds
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_asset_folds_source ON asset_folds(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_folds_target ON asset_folds(target_asset_id);

NOTIFY pgrst, 'reload schema';
