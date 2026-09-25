#!/usr/bin/env bash
#
# Chit: the auction room
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-auction-room.sh
#
# NO MIGRATION of its own. If you have not yet run v121 (permanent member
# links), run that first — it went out with the previous deploy.

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
git commit -m "Chit: an auction room, instead of a dropdown

A chit auction is called out loud, fast, with people shouting numbers across a
room. Choosing a member from a dropdown, typing a figure, pressing a button and
starting again was built for somebody sitting calmly at a desk. Nobody running
an auction is sitting calmly at a desk.

/chit/groups/[id]/auction is two columns. On the right, every eligible member
with a box beside their name: type, press Enter, next person. On the left, the
history - each bid with the time it landed, newest first - because 'what did he
bid last?' gets asked while you are mid-entry and should not cost you your
place. Both are the same live data, refreshed every four seconds, and a refresh
never overwrites a half-typed figure.

Members who cannot bid are shown rather than filtered away, greyed with the
month they took the pot, because 'why isn't Ramesh on the list' is a question
worth answering before it is asked. It also notes that they can still watch.

The standing bid, the minimum next bid, the ceiling and the bid count sit
across the top, and the leader is highlighted in both columns at once.

On a phone the entry list comes first and the history below it - the room is
what you are holding the phone for.

Opening and closing both live here now. The panel on the group page becomes
what it should have been: a status strip that says whether bidding is live and
gives you the way in. The bid-for-a-member form it briefly carried is gone -
that was the dropdown this replaces.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
