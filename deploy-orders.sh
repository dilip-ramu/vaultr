#!/usr/bin/env bash
#
# Orders: the spine a trade hangs off, with a per-order P/L
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-orders.sh
#
# MIGRATION: supabase/migration_v126_orders.sql  (run it FIRST, in the
# Supabase SQL editor — the pages read three new tables and will 404 the data
# without them).
#
# Commits only this change's files. selfhost/, the .gitignore edit and the
# purchase-order work are left alone.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Did you run migration v126?"
read -r -p "   supabase/migration_v126_orders.sql applied? [yes/no] " mig
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
  lib/orders/stage.ts \
  lib/orders/margin.ts \
  lib/orders/number.ts \
  lib/__tests__/orders-stage.test.ts \
  lib/__tests__/orders-margin.test.ts \
  lib/__tests__/orders-number.test.ts \
  components/orders/OrdersClient.tsx \
  components/orders/OrderForm.tsx \
  components/orders/OrderSheet.tsx \
  "app/(app)/orders/page.tsx" \
  "app/(app)/orders/new/page.tsx" \
  "app/(app)/orders/[id]/page.tsx" \
  "app/(app)/orders/[id]/edit/page.tsx" \
  components/AppShell.tsx \
  supabase/migration_v126_orders.sql \
  docs/ORDERS_PL_BUILD_PLAN.md
git commit -m "Orders: one record per customer PO, and what you made on it

Inex could already make every piece of paper in a trade but the sell chain
and the buy chain never met. Nothing recorded that THIS purchase order was
raised to fill THAT sales order, so the question 'what did I make on the
Pengvin order' had no answer anywhere in the app.

An order is one customer PO. The sales order, proforma, challans, customer
invoices, purchase orders and supplier bills for that job all point at it
with a nullable order_id, so nothing that exists today is moved or changed
and a one-off courier invoice simply never gets one.

The sheet has two columns. Planned is what you costed at when you agreed
the supplier price. Actual is what the real bills and the real bank rate
came to. The gap between them is the only honest answer to whether you are
pricing right, and you cannot see it from one column.

Three decisions worth knowing about, all in lib/orders/margin.ts:

- A cost line can be a percentage of customer value, supplier cost or gross
  margin. Not of net profit, which would depend on itself and would change
  answer depending on what order the lines happened to be in.
- The exchange-rate line is measured on what was actually invoiced, not on
  what was planned. On a part shipment, pretending the whole order was
  exposed to the rate mixes a pricing change into an FX number.
- The Actual column stands in the planned figure for anything not yet known
  and marks it with a tilde. Showing zero for a freight bill that has not
  arrived would make the margin look better than it is.

Order lines are matched by id on save, not deleted and re-inserted like the
other document forms do, because an order line also carries how much of it
has shipped - wiping that to correct a rate would lose a part shipment.

No stage dropdown can set an order to Closed. Closing writes bank entries,
so it has to be its own action with its own preview and undo. That is the
next phase; this one stops at the sheet.

Migration v126 adds orders, order_lines, order_costs and a nullable
order_id on documents, recoverable_invoices, supplier_invoices and
transactions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
