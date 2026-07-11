-- ── Migration v96: reusable template image assets + signature sizing ────────

-- 1. A library of images (letterheads, watermarks, stamps, banners) with their
--    preferred size / opacity / fit already set, so the same image can be
--    dropped into any template without re-adjusting it every time.
CREATE TABLE IF NOT EXISTS template_assets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,          -- public URL in vaultr-avatars
  path       TEXT,                   -- storage path (for deletion)
  width_px   INT  NOT NULL DEFAULT 240,
  height_px  INT  NOT NULL DEFAULT 140,
  opacity    NUMERIC NOT NULL DEFAULT 1,
  fit        TEXT NOT NULL DEFAULT 'contain',   -- contain | cover
  rotate     INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_assets_all" ON template_assets;
CREATE POLICY "template_assets_all" ON template_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON template_assets TO authenticated;

CREATE INDEX IF NOT EXISTS idx_template_assets_user ON template_assets(user_id, created_at DESC);

-- 2. Fixed print size per signature: pick width OR height (in mm) and the other
--    dimension follows the image's aspect ratio.
ALTER TABLE company_signatories
  ADD COLUMN IF NOT EXISTS sign_size_mode TEXT NOT NULL DEFAULT 'width',   -- 'width' | 'height'
  ADD COLUMN IF NOT EXISTS sign_size_mm   NUMERIC NOT NULL DEFAULT 50;
