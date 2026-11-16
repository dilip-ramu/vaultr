#!/usr/bin/env bash
#
# Invoices step 2: the page opens on the month, not on a question.
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash simplify-invoices-step2.sh
#
# NOTHING GOES ON main. Commits to its own branch. NO MIGRATION.
#
# To undo: bash restore-invoice-month.sh

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

BRANCH="simplify/invoice-month"

hr "0. What this adds"
cat <<'LIST'
   Invoices now opens on where the month stands:

     - one row per customer of what is waiting - consignments imported and
       not billed, expenses still to sort, expenses sorted and ready
     - each row links into the flow that clears it, customer already picked
     - a customer already invoiced this month is marked as such, because
       consignments that land after the invoice went out are what gets missed
     - invoiced / still owed / past due for the month, and a plain line
       comparing it with the month before

   New:      lib/customers/invoiceMonth.ts            (the arithmetic, 26 tests)
             lib/__tests__/customers-invoice-month.test.ts
             components/customers/invoices/MonthPanel.tsx
   Changed:  app/(app)/customers/invoices/page.tsx    (fetches the figures)
             components/customers/invoices/InvoiceChooser.tsx (shows the panel)

   NOTHING IS REMOVED. The three cards and the recent list are still there,
   below the panel. Without the panel's data the page is exactly what it was.
LIST
read -r -p "   Go on? [yes/no] " go
[ "$go" = "yes" ] || die "stopping at your request"

hr "1. Where we are"
HERE="$(git rev-parse --abbrev-ref HEAD)"
echo "   on $HERE"
if [ "$HERE" != "main" ]; then
  cat <<MSG
   Note: this will branch off $HERE, so $HERE's commits come with it when you
   merge. If you want this on its own, stop, merge or leave $HERE first, and
   run this again.
MSG
  read -r -p "   Carry on from $HERE? [yes/no] " c
  [ "$c" = "yes" ] || die "stopping at your request"
fi

hr "2. Clear stale build output"; rm -rf .next; echo "   done"
hr "3. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "4. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "5. Production build"; npm run build || die "build failed"; echo "   ok"

hr "6. Branch"
git rev-parse --verify "$BRANCH" >/dev/null 2>&1 \
  && git checkout "$BRANCH" \
  || git checkout -b "$BRANCH"
echo "   on $(git rev-parse --abbrev-ref HEAD)"

hr "7. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok
[ "$ok" = "yes" ] || die "stopping at your request — nothing committed"

hr "8. Commit on the branch"
git add -A
git commit -m "Invoices: open on the month, not on a question

Billing happens twelve times a year, so nobody arrives at this page
remembering where they got to. It asked 'what are you making?' when the app
already held the answer: consignments imported and not yet billed, expenses
paid on a customer's behalf and not yet sorted, and what went out the month
before to measure against.

So it reads the job back. One row per customer, what is waiting on each, and
a link into the flow that clears it with the customer already chosen - by
name for the courier flow, by id for the reimbursable one, and starting on
the sorting step only when something is left to sort.

A customer already invoiced this month still appears, marked. Consignments
that land after the invoice went out are exactly the thing that gets missed,
and hiding the row is how it stays missed.

Above it: invoiced, still owed, past due for the month, and one line
comparing the count with the month before - '2 so far, against 7 the month
before - 5 fewer'. For a monthly job, last month is the most useful reminder
there is.

lib/customers/invoiceMonth.ts holds all of it and is pure: month keys and
labels, grouping, the summaries and the wording, 26 tests. Customers are
matched by name rather than id, because a courier sheet carries a name and
may carry no id at all, and keying on the id split one customer into two
rows the moment one side had it and the other did not - a test covers that.

Nothing was removed: the three cards and the recent list sit below the
panel, and the page without the panel's data is what it was before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"

hr "Done"
cat <<'NEXT'
   Committed on simplify/invoice-month. main is untouched.

   Worth clicking (npm run dev), on /customers/invoices:
     - does the waiting list match what you believe is unbilled?
     - press a row: does it land in the right flow with the customer set?
     - is the last-month line right?
     - the three cards and the recent list still work?

   Happy:           git checkout main && git merge simplify/invoice-month && git push origin main
   Changed my mind: bash restore-invoice-month.sh
NEXT
