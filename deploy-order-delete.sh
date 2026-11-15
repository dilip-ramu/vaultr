#!/usr/bin/env bash
#
# Deleting an order takes its paperwork with it
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-delete.sh
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
  lib/orders/deletePlan.ts \
  lib/__tests__/orders-delete-plan.test.ts \
  "app/api/orders/[id]/route.ts" \
  components/orders/DeleteOrderButton.tsx \
  components/orders/OrderSheet.tsx
git commit -m "Orders: deleting one takes its paperwork with it

There was no delete at all. Now there is, on the order page, and it takes
the sales order, purchase order, quotation, proforma and challans the order
raised, along with its files, lines, costs and size breakdowns.

It does NOT take the money. A customer invoice carries a number in a GST
series and a supplier bill is an expense you may already have claimed;
those survive and simply stop pointing at an order that is gone. The
confirmation says so rather than leaving you to wonder.

And it refuses once money has moved. An order with a paid invoice against
it is not a mistake made while setting up - it is a finished trade, and
deleting it would cut the invoice loose from the job that explains why that
money came in. So it stops and names what is in the way: the invoice with
payment against it, the bill marked paid, the bank entries filed against
the order. Any bank entry at all blocks, because unlike an invoice there is
no unpaid version of a transaction.

A document that has merely been SENT does not block. Deleting the paperwork
is the point of the feature, and a purchase order emailed to a supplier is
exactly what you want gone when the order falls through. Money is the test,
not paper.

Never a bare 'are you sure'. The button asks the server what would happen
and lists it - every document by name, the file count, what is being kept -
before anything is touched.

The plan is worked out again on the server at the moment of deleting. The
preview the browser is holding may be two minutes old, and that is not
evidence that nobody has been paid since.

document_links rows are cleaned up by hand because they point at documents
by id with no foreign key behind them - deleting the documents alone would
leave the chain view on another document rendering gaps. Uploaded files are
removed from storage before the rows that name them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
