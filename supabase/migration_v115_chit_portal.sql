-- ─────────────────────────────────────────────────────────────────────────────
-- v115 — Chit member portal, phase 1 (read-only passbook)
--
-- WHAT THIS IS FOR
-- Chit members are people, not app users. They need to see their own dues and
-- receipts, and the auction result that decided this month's figure. They must
-- never see anything else in Inex.
--
-- THE SECURITY MODEL, STATED PLAINLY
--
--   1. Members do NOT get Supabase Auth accounts. Every table in this app is
--      guarded by `auth.uid() = user_id`, which means "the owner". Letting a
--      member hold an auth session would mean loosening those policies on
--      tables that also hold the owner's money. We do not touch them.
--
--   2. The portal identifies members with its OWN sessions, held in the tables
--      below, and reads data through the service role in exactly one server
--      module (lib/chit/portal-data.ts). Scoping happens there, in one place
--      that can be audited, rather than scattered across pages.
--
--   3. These tables are therefore OWNER-ONLY under RLS, exactly like every
--      other table. No anon or authenticated client can read a session row or a
--      PIN hash. Only the service role, server-side, can.
--
--   4. Nothing here stores a token or a PIN in the clear. Only SHA-256 hashes
--      of tokens and a salted scrypt hash of the PIN are stored, so a database
--      leak does not hand anyone a working login.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS chit_portal_sessions, chit_portal_invites,
--     chit_member_pins CASCADE;
--   ALTER TABLE chit_members DROP COLUMN IF EXISTS portal_enabled;
-- Nothing else references them, so this restores the previous behaviour exactly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Who is allowed a portal login at all ────────────────────────────────────
-- Defaults to FALSE. Access is granted one member at a time, deliberately —
-- adding a member to a chit does not silently create an external login.
ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;

-- ── One-time login links ────────────────────────────────────────────────────
-- The foreman mints one of these and sends it over WhatsApp. It is valid once
-- and briefly: opening it exchanges it for a session, after which the link is
-- dead. A message forwarded afterwards does nothing, which is the whole point.
CREATE TABLE IF NOT EXISTS chit_portal_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,

  -- SHA-256 of the token. The token itself exists only in the WhatsApp message.
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  -- Kept for the audit trail: which invite created which session.
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chit_portal_invites_member_idx ON chit_portal_invites (member_id);
CREATE INDEX IF NOT EXISTS chit_portal_invites_hash_idx   ON chit_portal_invites (token_hash);

-- ── Live sessions ───────────────────────────────────────────────────────────
-- One row per phone that has logged in. Revoking is a row update, so cutting a
-- member off is instant and does not depend on them cooperating.
CREATE TABLE IF NOT EXISTS chit_portal_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,
  invite_id     uuid REFERENCES chit_portal_invites(id) ON DELETE SET NULL,

  session_hash  text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  -- Evidence, not tracking: enough to answer "who was signed in when" if a
  -- member ever disputes something. No location, no fingerprinting.
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chit_portal_sessions_member_idx ON chit_portal_sessions (member_id);
CREATE INDEX IF NOT EXISTS chit_portal_sessions_hash_idx   ON chit_portal_sessions (session_hash);

-- ── PINs ────────────────────────────────────────────────────────────────────
-- Set by the member on first login. Phase 1 does not require it to read the
-- passbook; it exists now so that phase 2 (bidding) has something to demand
-- before a member can commit to money, and so members set it while onboarding
-- rather than in the middle of an auction.
CREATE TABLE IF NOT EXISTS chit_member_pins (
  member_id        uuid PRIMARY KEY REFERENCES chit_members(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- scrypt, salted per member. Never the PIN itself.
  pin_hash         text NOT NULL,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: owner-only, same as everything else ────────────────────────────────
-- The portal does not rely on these policies — it uses the service role. They
-- exist so that a mistake elsewhere (an anon key on a client, a stray query)
-- cannot read a session hash or a PIN hash.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chit_portal_invites', 'chit_portal_sessions', 'chit_member_pins'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_owner', t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
