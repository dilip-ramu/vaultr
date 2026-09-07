#!/usr/bin/env bash
#
# Chit member portal — phase 1 (read-only passbook)
#
# Run from the repo root in the macOS Terminal:
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-portal.sh
#
# THIS ONE NEEDS A MIGRATION. The script will not commit until you confirm it
# has been applied, because the code expects the new tables to exist.
#
# Nothing existing changes: no table is altered except chit_members, which gains
# one boolean that defaults to FALSE. Until you switch a member on and send them
# a link, this feature is inert.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"

hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(portal)"
  app/api/chit/portal
  app/api/portal
  components/chit/portal
  components/chit/ChitMembersClient.tsx
  lib/chit/portal-auth.ts
  lib/chit/portal-data.ts
  lib/chit/portal-session.ts
  lib/chit/types.ts
  lib/__tests__/chit-portal.test.ts
  supabase/migration_v115_chit_portal.sql
)

hr "1. Clear stale build output"
rm -rf .next
echo "   done"

hr "2. Typecheck"
npx tsc --noEmit || die "typecheck failed — do not deploy"
echo "   clean"

hr "3. Tests"
npm test || die "tests failed — do not deploy"
echo "   all suites passed"

hr "4. Production build"
npm run build || die "next build failed — do not deploy"
echo "   build ok"

hr "5. MIGRATION — apply this before continuing"
cat <<'MSG'
   Supabase Dashboard -> SQL Editor -> New query.
   Paste and run:  supabase/migration_v115_chit_portal.sql

   Then verify (all three should come back as expected):

     -- 3 new tables
     select table_name from information_schema.tables
      where table_schema='public'
        and table_name in ('chit_portal_invites','chit_portal_sessions','chit_member_pins');

     -- the new flag, defaulting to false
     select column_name, column_default from information_schema.columns
      where table_name='chit_members' and column_name='portal_enabled';

     -- nobody has portal access yet, which is correct
     select count(*) from chit_members where portal_enabled;

   ALSO CHECK, in Vercel -> Settings -> Environment Variables:
     SUPABASE_SERVICE_ROLE_KEY   must be set (the portal reads through it)
     NEXT_PUBLIC_SITE_URL        optional; sets the domain in the login link.
                                 Without it the link uses whatever host the
                                 request came in on, which is usually right.
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply the migration first"

hr "6. Review the change"
git status --short
echo
read -r -p "   Does this look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit"
git add -- "${FILES[@]}"
git commit -m "Chit member portal, phase 1: read-only passbook for members

Chit members are people, not app users. They can now see their own dues,
receipts and each month's auction result, and nothing else in Inex.

Members deliberately do NOT get Supabase Auth accounts. Every table in this app
is guarded by auth.uid() = user_id; giving a member a session would mean
loosening those policies on tables that hold the owner's money. Instead the
portal keeps its own sessions and reads through the service role in exactly one
module, lib/chit/portal-data.ts, where every function takes memberId as its
first argument and filters on it. No portal page or route imports a Supabase
client of its own.

Login is a one-time link sent over WhatsApp, matching how auction notices
already go out. A link is single-use and expires in 30 minutes: opening it
exchanges it for an httpOnly session cookie and burns the invite, so a forwarded
message achieves nothing. Sending a new link kills the previous one. Only
SHA-256 of the token and a salted scrypt hash of the PIN are stored. Switching a
member's access off signs them out everywhere on their next page load.

Members set a 4-digit PIN on first login. It is not needed to read the passbook;
it exists to gate the writes that phase 2 (bidding) will add, and it is
collected during onboarding rather than mid-auction.

Auction figures are shown so a member can check how their monthly amount was
worked out — winner's name only, never contact details, identifiers or another
member's payment status. Aadhaar, PAN, nominees and guarantors are excluded by
an explicit field list rather than by a wildcard select.

Adds migration v115. portal_enabled defaults to false, so this is inert until
access is granted one member at a time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
echo "   committed"

hr "8. Push"
git push origin main
echo
echo "   Then, to try it end to end:"
echo "     1. Chit -> Members, press 'Portal off' on ONE member to switch it on"
echo "     2. Press the link icon — WhatsApp opens with the login link prefilled"
echo "     3. Open that link on a phone; set a PIN; check the passbook"
echo "     4. Press 'Portal on' to switch it back off and confirm the phone is signed out"
