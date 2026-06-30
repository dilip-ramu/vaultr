-- ── Migration v52: anonymous page-view counts (your own data) ──────────────
-- Tiny log of which pages you actually open. Used to make data-driven calls
-- on what to keep in the sidebar vs retire. No external service involved.
--
-- Each row: which user, which path, when. That's it.

CREATE TABLE IF NOT EXISTS page_views (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pv_insert_self" ON page_views;
DROP POLICY IF EXISTS "pv_select_self" ON page_views;
CREATE POLICY "pv_insert_self" ON page_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pv_select_self" ON page_views FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT INSERT, SELECT ON page_views TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE page_views_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_pv_user_time ON page_views(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_path      ON page_views(user_id, path);
