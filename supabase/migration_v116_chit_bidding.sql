-- ─────────────────────────────────────────────────────────────────────────────
-- v116 — Chit member portal, phase 2: online bidding
--
-- WHAT THIS DOES, AND MORE IMPORTANTLY WHAT IT DOES NOT
--
-- Members can now place bids from their phone during an auction. A bid is a
-- REQUEST, not a result. Nothing here writes to chit_auctions, chit_collections
-- or transactions — the foreman still records the auction by hand, exactly as
-- before, and the bid log is only what he reads before doing so. That boundary
-- is the point: an external person's action can never move money in your books.
--
-- TWO TABLES
--
--   chit_bid_windows — one per group per month. The foreman opens it and closes
--     it; there is no clock. The ceiling and the minimum increment are FROZEN
--     onto the row at open time, so changing a group's settings later cannot
--     retrospectively make a past bid invalid or valid.
--
--   chit_bids — every bid ever placed, append-only. In an open auction members
--     outbid each other, so the log is the evidence of what happened and in what
--     order. A trigger blocks UPDATE and DELETE: a bid log that can be edited is
--     not evidence of anything.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS chit_bids, chit_bid_windows CASCADE;
--   DROP FUNCTION IF EXISTS chit_bids_immutable();
-- Nothing else references them, so this restores v115 behaviour exactly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The window ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_bid_windows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  month_number  integer NOT NULL CHECK (month_number >= 1),

  status        text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'cancelled')),

  -- Frozen at open time from the group's bid_ceiling_pct. Stored, not derived,
  -- so a later settings change cannot rewrite what the rules were on the night.
  ceiling_amount numeric(14,2) NOT NULL CHECK (ceiling_amount > 0),
  -- The least a new bid must beat the standing one by. Stops a ₹1 ladder.
  min_increment  numeric(14,2) NOT NULL DEFAULT 100 CHECK (min_increment > 0),

  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  notes         text,

  -- One bidding window per month per group. Re-opening the same month is an
  -- update, never a second window with its own separate bid history.
  UNIQUE (group_id, month_number)
);
CREATE INDEX IF NOT EXISTS chit_bid_windows_group_idx ON chit_bid_windows (group_id, status);

-- At most ONE open window per group. Two live auctions in the same group would
-- mean two members each believing they had won.
CREATE UNIQUE INDEX IF NOT EXISTS chit_bid_windows_one_open
  ON chit_bid_windows (group_id) WHERE status = 'open';

-- ── The bids ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chit_bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  window_id     uuid NOT NULL REFERENCES chit_bid_windows(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,
  month_number  integer NOT NULL CHECK (month_number >= 1),

  -- The DISCOUNT the member is willing to give up, in rupees. Same unit as
  -- chit_auctions.bid_amount, so the winning bid carries straight across.
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),

  placed_at     timestamptz NOT NULL DEFAULT now(),
  -- Evidence for a disputed bid. Which phone, which session, from where.
  session_id    uuid REFERENCES chit_portal_sessions(id) ON DELETE SET NULL,
  ip            text,
  -- 'portal' = the member placed it themselves. 'foreman' = recorded on their
  -- behalf, e.g. a member who phoned in. Recorded honestly, never disguised.
  source        text NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'foreman'))
);
CREATE INDEX IF NOT EXISTS chit_bids_window_idx ON chit_bids (window_id, amount DESC);
CREATE INDEX IF NOT EXISTS chit_bids_member_idx ON chit_bids (member_id);

-- ── Append-only ─────────────────────────────────────────────────────────────
-- A bid is a claim about what somebody offered at a moment in time. If it can
-- be edited afterwards it settles no argument. Corrections are new rows.
CREATE OR REPLACE FUNCTION chit_bids_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'chit_bids is append-only: bids cannot be % once placed', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chit_bids_no_update ON chit_bids;
CREATE TRIGGER chit_bids_no_update BEFORE UPDATE ON chit_bids
  FOR EACH ROW EXECUTE FUNCTION chit_bids_immutable();

DROP TRIGGER IF EXISTS chit_bids_no_delete ON chit_bids;
CREATE TRIGGER chit_bids_no_delete BEFORE DELETE ON chit_bids
  FOR EACH ROW EXECUTE FUNCTION chit_bids_immutable();

-- ── RLS: owner-only, like everything else ───────────────────────────────────
-- Members reach these through the portal's own server code, never with a key of
-- their own. These policies mean a stray anon client cannot read the bid book.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chit_bid_windows', 'chit_bids'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_owner', t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
