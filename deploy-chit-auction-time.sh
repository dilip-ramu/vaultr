#!/usr/bin/env bash
#
# Chit: each group sets its own auction time
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-auction-time.sh
#
# NEEDS MIGRATION v122 — one new column. Read step 5 before answering yes.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v122_chit_auction_time.sql

   Adds ONE column, chit_groups.auction_time, and sets every existing group to
   18:30 - the time the notice has been claiming all along, so nothing changes
   for members who have already been told 6:30. Change any group that meets at
   another time on its own page.

   VERIFY:
     select name, auction_day, auction_time from chit_groups order by name;
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply and verify the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit: each group sets its own auction time

The auction notice has always carried a time, and that time was the string
'6:30 PM' typed into the code - one figure for every group, in every month,
whatever the group actually does. A notice that states the wrong time is worse
than one that states none, because members turn up when it says.

So the time is a property of the group now, beside the day of the month it
already had. It is on the create form and on the group's own settings, and the
auction room shows it too, so whoever is running it can see at a glance whether
they are early or late.

Nullable on purpose: a group that has not settled on a time sends a notice with
no time line rather than a made-up one, and the form says so.

Stored as `time`, not text - '18:30' is a time and the database should be the
thing that refuses '25:99'. The conversions between what Postgres returns
('18:30:00'), what a browser sends ('18:30') and what a member reads ('6:30 PM')
are a pure module with 11 tests, including midnight and noon, which is where
12-hour clocks usually break.

The migration sets every existing group to 18:30, so nothing changes for anyone
already told 6:30.

Adds migration v122.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
