#!/usr/bin/env bash
#
# Chit member portal — phase 2 (online bidding)
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-bidding.sh
#
# NEEDS MIGRATION v116. The script will not commit until you confirm it ran.
#
# Nothing existing changes. Two new tables, and bidding only happens when you
# open a window — until then the feature is invisible to members.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"

hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(portal)/m/g/[groupId]/page.tsx"
  app/api/chit/bidding
  app/api/portal/auction
  app/api/portal/bid
  components/chit/ChitGroupDetail.tsx
  components/chit/LiveBiddingPanel.tsx
  components/chit/portal/PortalBidPanel.tsx
  components/chit/portal/PortalGroup.tsx
  lib/chit/bidding.ts
  lib/chit/portal-bids.ts
  lib/chit/portal-data.ts
  lib/__tests__/chit-bidding.test.ts
  supabase/migration_v116_chit_bidding.sql
)

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   all suites passed"
hr "4. Production build"; npm run build || die "next build failed"; echo "   build ok"

hr "5. MIGRATION — apply before continuing"
cat <<'MSG'
   Supabase Dashboard -> SQL Editor -> New query.
   Paste and run:  supabase/migration_v116_chit_bidding.sql

   Then verify:

     -- 2 new tables
     select table_name from information_schema.tables
      where table_schema='public' and table_name in ('chit_bid_windows','chit_bids');

     -- the bid log really is append-only (both must ERROR)
     update chit_bids set amount = amount where false;
     delete from chit_bids where false;

     -- only one auction can be live per group
     select indexname from pg_indexes where indexname = 'chit_bid_windows_one_open';
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit"
git add -- "${FILES[@]}"
git commit -m "Chit member portal, phase 2: members bid from their phones

An open auction, run the way the room runs it: the standing highest bid is on
screen and members outbid each other until the organiser closes the window.
There is no timer anywhere, so 'closed' always means a person closed it and
there is never an argument about a bid landing a second too late.

A BID IS A REQUEST, NOT A RESULT. It writes one row to chit_bids and nothing
else. It cannot reach chit_auctions, chit_collections, transactions or accounts.
Closing the window reports who was highest; recording the auction remains the
same manual step in the same form. So the worst a compromised member session can
do is put a number in a list that a person then reads.

Placing a bid needs a live portal session, the correct PIN every time, and every
rule in lib/chit/bidding.ts: the window open, the member in the group, the member
not already prized, the bid beating the standing one by the frozen increment and
not exceeding the frozen ceiling. The rules are checked BEFORE the PIN, so a
mistyped amount does not burn one of a member's five attempts.

The ceiling and increment are frozen onto the window at open time: changing a
group's settings later cannot rewrite the rules of an auction already held.
chit_bids is append-only by trigger, because a bid log that can be edited settles
no argument. A partial unique index allows at most one open window per group.

Members see the standing amount and whether they are leading — never who placed
it. Ties break in favour of whoever bid first, and members are told that rule.

Adds migration v116. Inert until you open a window.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
echo "   committed"

hr "8. Push"
git push origin main
echo
echo "   To try it end to end:"
echo "     1. Chit -> a group -> Auctions tab -> 'Open bidding for month N'"
echo "     2. On a member's phone, open their portal link and place a bid"
echo "     3. Watch it appear in the admin list within a few seconds"
echo "     4. 'Close bidding' — it names the highest bidder but records nothing"
echo "     5. 'Conduct auction' as usual, entering that winner and bid"
