#!/usr/bin/env bash
#
# Orders: customer receipts, per-piece P/L, and an invoice that is not blank
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-money2.sh
#
# MIGRATION: supabase/migration_v130_order_payments.sql
#   If you already ran v130, run it again — it is idempotent and now adds the
#   party and customer_id columns.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Migration"
read -r -p "   supabase/migration_v130_order_payments.sql applied (or re-applied)? [yes/no] " mig
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
  lib/orders/margin.ts \
  lib/__tests__/orders-payments.test.ts \
  lib/__tests__/orders-payment-slip.test.ts \
  lib/__tests__/orders-margin.test.ts \
  components/orders/OrderPayments.tsx \
  components/orders/OrderSheet.tsx \
  "app/api/orders/[id]/payments/route.ts" \
  "app/(app)/orders/[id]/page.tsx" \
  "app/(app)/customers/invoices/direct/page.tsx" \
  supabase/migration_v130_order_payments.sql
git commit -m "Orders: money comes in as well as out, and the invoice is not blank

Four things you hit.

THE CUSTOMER INVOICE OPENED EMPTY. A plain bug: raising it from an order
set the customer, the company and the currency and then passed an empty
list of lines. It now carries the styles, the spec, the size breakdown and
the price the customer agreed, and defaults an export invoice to no GST
because an export is zero-rated.

MONEY ONLY WENT ONE WAY. order_payments knew about suppliers. An order has
money moving both ways, so a payment now has a SIDE, and the side decides
the direction: customer in, supplier out, and a refund is whichever of
those reversed. One set of three kinds rather than six to keep straight.
The two sides are shown separately and never netted - an order fully paid
out with nothing collected yet is exactly the case a single combined
figure would hide.

ACTUAL SAID ZERO AND NOTHING SAID WHY. It fills in from the paperwork
attached to the order - customer invoices for the value, supplier bills
for the cost - and with neither attached it read as a broken figure rather
than an empty one. The P/L now says where it comes from and what to
attach.

PER-PIECE PROFIT. Gross and net per piece, on both columns. Both are
divided by the same figure, the quantity ordered: dividing the actual by
what happened to be invoiced would make a part shipment look more
profitable per piece than it is.

The payment slip keeps its own wording. The dropdown says 'Advance paid'
so the two sides read differently while choosing, but the slip already
names who was paid, and 'Advance paid against order' reads like a stutter.

Migration v130 now also adds order_payments.party and customer_id.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
