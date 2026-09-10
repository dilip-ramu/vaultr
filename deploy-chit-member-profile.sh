#!/usr/bin/env bash
#
# Chit members — member numbers, fuller profiles, and a member page
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-member-profile.sh
#
# NEEDS MIGRATION v119.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION — apply before continuing"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v119_chit_member_profile.sql

   It gives every existing member a number, in joining order. Check it:

     select member_code, name, phone
       from chit_members
      order by member_code;

   Expect UC00001 upwards with no gaps and no repeats.
MSG
read -r -p "   Migration applied and checked? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit members: member numbers, fuller profiles, and a member page

Members now carry a number (UC00001 upwards), bank details for paying their
prize, and a link to the member who introduced them. Existing members are
backfilled with numbers in joining order.

The number is editable, because the numbers in the ledger you already keep are
the ones that matter and the app should match them rather than insist on its
own. It is unique per user, enforced by a partial index: two members sharing a
number makes every paper receipt carrying it ambiguous, and that surfaces only
after money is in the wrong column. New members without a typed number get one
past the highest issued - not count+1, which would re-issue a number after a
deletion and collide with the receipt still carrying it.

Introduced-by is a real link to another member rather than a name in a box, so
the member page can show both who introduced them and whom they introduced.

Opening a member now shows their position: which chits they are in, what was
raised against them, what they have paid, what they owe, how many instalments
are overdue, dividends credited, which chits they have won and whether the prize
was actually paid out - plus their securities, guarantors and nominees. Every
figure comes from recorded rows, so it matches the passbook in the member's
hand.

CSV import gains a Download example CSV button. The sample is generated FROM the
column list the parser reads, and a test asserts every column in the sample maps
back to a field - otherwise the two drift, someone fills in a column the
importer ignores, and the data silently does not arrive. The parser handles
quoted fields with commas, accepts the header spellings real spreadsheets use,
reports bad rows individually instead of failing the file, and resolves
Introduced By after every row exists so a file can reference a member it creates
further down.

Adds migration v119.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
