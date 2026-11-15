#!/usr/bin/env bash
#
# Chit groups list: how many collections are still pending, and how late
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-pending.sh
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
git add \
  lib/chit/pending.ts \
  lib/__tests__/chit-pending.test.ts \
  components/chit/ChitGroupsClient.tsx \
  "app/(app)/chit/groups/page.tsx"
git commit -m "Chit groups: show what each chit is still waiting to collect

Two counts on every card, never added together. Yellow for collections due
in the last 30 days, red for anything older - a collection missed this
month is a reminder, one missed since June is a problem, and one number in
one colour hides the difference that is the only reason to look.

  3 out of 20 pending   (red)
  15 out of 20 pending  (yellow)

Every unpaid month counts, not every member. Arrears pile up: a member four
months behind is four collections not made, and the card says four. And
each month is coloured by its OWN age, not by the member's worst - a
defaulter who owes June, July, August and this month shows as three red and
one yellow, which is the truth.

The 'out of 20' is the member count, which is one month's worth of
collections. When arrears run deep the number can pass it - twenty members
two months behind is 40 out of 20 - so a line underneath says how many
people are actually late. It counts the members who are LATE rather than
everyone who owes something: '15 members behind' on a group where fourteen
simply have not paid this month yet is true and useless.

A month whose auction has no recorded date counts as recent rather than
overdue. A missing date is not evidence of lateness.

The numbers come from the same groupLedger the collection screen and the
statement read, so the list cannot say a member has paid while the group
page says they have not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
