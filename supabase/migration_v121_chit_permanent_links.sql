-- ─────────────────────────────────────────────────────────────────────────────
-- v121 — One permanent portal link per member
--
-- WHAT CHANGED AND WHY
--
-- The portal link was single-use and expired. That made sense as a security
-- story and made no sense as a product: a member who changes phone, clears
-- their browser, or simply taps the link twice is locked out and has to ask the
-- foreman for a new one. Members are members for five years; the link should
-- last as long as they do.
--
-- So the link becomes permanent, and the SECRET MOVES. Before, the link was the
-- credential and the PIN only guarded bidding. Now the link identifies WHO you
-- are and the PIN proves you ARE them — asked once per device, not once per
-- action. A forwarded link on its own opens nothing once a PIN is set.
--
-- The token is stored in plain text, deliberately. Hashing it would mean the
-- foreman could never show a member their own link again, only replace it, and
-- "I lost the message" is the common case. The token is an identifier guarded
-- by the PIN, not a password.
--
-- ROLLBACK
--   ALTER TABLE chit_members DROP COLUMN IF EXISTS portal_token;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE chit_members ADD COLUMN IF NOT EXISTS portal_token text;

-- Two members sharing a token would be two people behind one door.
CREATE UNIQUE INDEX IF NOT EXISTS chit_members_portal_token_key
  ON chit_members (portal_token) WHERE portal_token IS NOT NULL;

-- Bids can now be recorded by the foreman on a member's behalf — someone who
-- phoned in, or who is standing in the room without a phone. The column already
-- allows it; this is here so the intent is written down with the change.
--   chit_bids.source = 'portal'  → the member placed it themselves
--   chit_bids.source = 'foreman' → recorded for them, honestly labelled

NOTIFY pgrst, 'reload schema';
