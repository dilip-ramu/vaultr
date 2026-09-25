#!/usr/bin/env bash
#
# Chit bidding: any round hundred that beats the standing bid
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-bid-step.sh
#
# NO MIGRATION. The fix takes effect on the auction that is open right now.

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
git commit -m "Chit bidding: raise by a hundred, not by a quarter of a percent

Reported: after bidding 1500, the next bid had to be 2800.

The minimum raise was a quarter of a percent of the pot, rounded up to the
nearest hundred. On a 5,20,000 chit that is 1300, so the floor above a 1500 bid
was 2800. That is not how the auction is called in the room, where any round
hundred that beats the standing bid is a bid.

So the increment is one step - 100 - whatever the pot, and a bid must be a
multiple of 100. A member bidding 1650 is told the round figure to use rather
than just refused, and the step is checked before the ceiling so the advice they
get is the useful one.

The window freezes a min_increment when it opens, and this deliberately ignores
it. No screen has ever let a foreman choose that number, so every stored value
came from the automatic default - reading it back would have kept the wrong
floor alive for the auction that is open right now, and needed a migration to
clear. The column stays; nothing reads it.

Both screens now say the rule where the number is typed: the member's phone
reads 'in multiples of 100', and the foreman's panel says bids rise in 100s
rather than quoting a frozen figure that no longer applies.

Existing bidding tests rewritten to the new rule, plus the reported case as its
own test: standing 1500, 1600 accepted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
