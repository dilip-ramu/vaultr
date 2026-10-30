#!/usr/bin/env bash
#
# Reimbursables: hide what is already billed
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-reimbursables-hide-billed.sh
#
# NO MIGRATION.

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
git commit -m "Reimbursables: open on what still needs doing, not on history

The expenses list opened on 'All', so a customer a couple of years into a
monthly arrangement showed hundreds of already-billed rows above the handful
that actually need sorting. The work is always at the unbilled end; the billed
end is history, and history belongs behind a filter rather than in front of it.

Default is now 'Not billed'. The filters read as the states they describe:
Not billed, Needs a category, Ready, Billed, All.

What is hidden is said out loud - '14 already billed, hidden', and clicking it
shows everything. A row that is silently missing is a row somebody re-enters,
and 'mark billed' is already an easy thing to press by accident: it removes an
expense from the queue without attaching it to any invoice, so the way back to
those rows has to stay visible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
