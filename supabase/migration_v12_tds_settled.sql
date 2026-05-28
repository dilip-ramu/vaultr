-- ── Migration v12: TDS Settled flag ───────────────────────────────────────

ALTER TABLE recoverable_tds_entries
  ADD COLUMN IF NOT EXISTS settled    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
