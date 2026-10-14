#!/usr/bin/env bash
#
# Chit groups: when each one runs, at what time, and finished ones put away
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-group-dates.sh
#
# NO MIGRATION. Needs v122 (auction time) from the earlier deploy.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok
[ "$ok" = "yes" ] || die "stopping at your request"

hr "6. Commit and push"
git add -A
git commit -m "Chit groups: drop an import the previous commit left behind

19bfe68 swept up this page while it was half finished - the deploy script runs
git add -A, so work in progress rides along with whatever is being deployed.
Everything in it works; numberOfMonths was simply no longer called once the card
started reading the tenure off the derived schedule.

The page itself, as it now stands: each card shows the span of the chit - first
auction to last - and the time of day it auctions, so the list can be reviewed
without opening five groups. Neither date is stored; both are derived from the
start date, the auction day and the tenure, because a stored end date goes stale
the moment somebody corrects the start.

Finished groups sit in their own collapsed section. A group counts as finished
when its last auction has passed OR when it is marked completed or cancelled -
the owner\'s word beats the calendar, and the calendar catches the ones nobody
remembered to close." || die "commit failed"
git push origin main
