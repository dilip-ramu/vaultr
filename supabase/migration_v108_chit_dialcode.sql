-- v108 — country dial code on chit members
--
-- WhatsApp deep links (wa.me) need the number in full international form —
-- <dial code><national number>, no plus, no spaces. We already store the phone
-- as a 10-digit national number; this adds the country's dial code alongside so
-- the two can be joined into a wa.me link.
--
-- Defaults to 91 (India), which is every existing member, so this changes
-- nothing on its own.
--
-- ── To revert ───────────────────────────────────────────────────────────────
--   ALTER TABLE chit_members DROP COLUMN IF EXISTS dial_code;

ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS dial_code text NOT NULL DEFAULT '91';

COMMENT ON COLUMN chit_members.dial_code IS
  'Country dialling code without +, e.g. 91 for India. Joined with phone for wa.me links.';
