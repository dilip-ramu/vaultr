#!/usr/bin/env bash
#
# Orders: advances, payments, and the notes both ways
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-money.sh
#
# MIGRATION: supabase/migration_v130_order_payments.sql  (run it FIRST)
# Needs v126–v129 already applied.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Migration"
read -r -p "   supabase/migration_v130_order_payments.sql applied? [yes/no] " mig
[ "$mig" = "yes" ] || die "run the migration first, then start this again"

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
  lib/orders/payments.ts \
  lib/orders/paymentSlip.ts \
  lib/documents/config.ts \
  lib/__tests__/orders-payments.test.ts \
  lib/__tests__/orders-payment-slip.test.ts \
  components/orders/OrderPayments.tsx \
  components/orders/OrderSheet.tsx \
  components/orders/DeleteOrderButton.tsx \
  components/HubTabs.tsx \
  "app/api/orders/[id]/payments/route.ts" \
  "app/(app)/orders/[id]/page.tsx" \
  "app/(app)/suppliers/documents/[type]/new/page.tsx" \
  supabase/migration_v130_order_payments.sql
git commit -m "Orders: advances and payments post real bank entries

An advance to a supplier is not a note on a page, it is rupees leaving a
bank account. So every payment recorded on an order posts a REAL
transaction against the account you choose, and from that moment it is in
the balances, the Books and the net worth like any other rupee. Chit
already works this way; this is the order side of the same idea, with the
rules in one place so no screen can post an order payment differently.

Advance and payment go OUT, a refund comes IN. The direction is DERIVED
from the kind rather than stored beside it: two fields that have to agree
are two fields that eventually will not, and the one that would be wrong is
the one deciding whether the balance goes up or down.

Deleting a payment deletes the entry it posted - that exact entry, by id,
never a query by amount and date that would cheerfully delete somebody
else's identical payment. The transaction is written first and rolled back
if the payment row fails, because the other order leaves a payment pointing
at nothing, which reads on screen as money that moved and cannot be found.

The link is ON DELETE SET NULL, not CASCADE. A transaction deleted from the
Transactions page leaves the payment row behind with a visible 'no bank
entry' against it, because a missing advance is a question somebody has to
be able to ask.

What is owed is measured against the BILLS, not the agreed cost: until the
supplier invoices, nothing is owed however much the order says it will come
to. An advance paid before any bill shows as money they are holding.

Every payment prints a slip - a receipt when the money came back - with the
amount in words and the account named on the face of it, because the
account is what ties the slip to the bank statement.

Adjustments both ways: a debit note when the supplier owes us, and a credit
note when we owe them. The supplier-side credit note did not exist, so it
is added to the document config with its own SCN series, sharing the
credit_note doc_type and kept apart by party_kind exactly as
delivery_challan already is. Raised from an order, a note prefills as ONE
adjustment line - listing every style with blank rates is a form somebody
has to delete their way out of - and carries no packing or cut-off dates,
which belong on the purchase order it adjusts.

Migration v130 adds order_payments.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
