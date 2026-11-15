#!/usr/bin/env bash
#
# Orders become a flow: steps, files, size breakdowns, the supplier pack and
# a dashboard
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-orders-flow.sh
#
# MIGRATIONS (run BOTH, in order, in the Supabase SQL editor, before this):
#   supabase/migration_v126_orders.sql       - orders, lines, costs
#   supabase/migration_v127_order_flow.sql   - files, size rows, descriptions
#   supabase/migration_v128_order_dates.sql  - cut-off date and ETD on the order

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Migrations"
read -r -p "   v126, v127 AND v128 applied in Supabase? [yes/no] " mig
[ "$mig" = "yes" ] || die "run all three migrations first, then start this again"

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
  lib/orders \
  lib/documents/buildModel.ts \
  lib/__tests__/orders-stage.test.ts \
  lib/__tests__/orders-margin.test.ts \
  lib/__tests__/orders-number.test.ts \
  lib/__tests__/orders-sizes.test.ts \
  lib/__tests__/orders-flow.test.ts \
  lib/__tests__/orders-summary-doc.test.ts \
  lib/__tests__/orders-to-document.test.ts \
  lib/__tests__/orders-dates.test.ts \
  lib/__tests__/documents-money.test.ts \
  lib/__tests__/documents-adapters-currency.test.ts \
  lib/documents/money.ts \
  lib/documents/adapters.ts \
  lib/documents/config.ts \
  components/documents/DocumentsClient.tsx \
  components/customers/invoices/TypedInvoiceClient.tsx \
  "app/(app)/customers/invoices/direct/page.tsx" \
  "app/(app)/customers/documents/[type]/[id]/edit/page.tsx" \
  "app/(app)/suppliers/documents/[type]/[id]/edit/page.tsx" \
  app/api/recoverables/invoices/typed \
  components/orders \
  components/documents/DocumentForm.tsx \
  components/AppShell.tsx \
  "app/(app)/orders" \
  "app/(app)/customers/documents/[type]/new/page.tsx" \
  "app/(app)/suppliers/documents/[type]/new/page.tsx" \
  "app/(print)/documents/[id]/print/page.tsx" \
  "app/api/documents/[id]/model/route.ts" \
  supabase/migration_v126_orders.sql \
  supabase/migration_v127_order_flow.sql \
  supabase/migration_v128_order_dates.sql \
  docs/ORDERS_PL_BUILD_PLAN.md
git commit -m "Orders: run the whole trade from one page

The order page was a filing cabinet - nine equal panels and you had to
remember what came next. It is now the flow the work actually has: their
order in, confirm it, buy it, cost it, invoice it. One step is current at a
time, the first one not done, and every other step stays clickable. It
marks the path, it does not block it: an order that arrives with the
purchase order already placed is not argued with.

Create sales order and Create purchase order open the real document forms
with the styles, the spec, the size breakdown and the agreed rate already
filled in, and file the saved document back against the order. Retyping
them is how a supplier ends up being told something different from what
the customer agreed. The supplier itself is never guessed - an order can be
bought from more than one.

Files live on the order, tagged customer side or supplier side. The
supplier pack is one zip holding the purchase order, a one-page summary and
every file tagged for them. It is zipped in the browser, not on the server,
because jsPDF loads the letterhead through an Image element and a purchase
order without the letterhead looks like a draft. Nothing says 'done' when a
file could not be fetched - the whole point is that the supplier gets
everything.

Size breakdowns. A garment line is never one number. Sizes are sub-rows,
and when a line has them THEY are the quantity: the line total goes
read-only and is their sum. Two places to type one number is two places for
them to disagree, and the one that reaches the supplier would be whichever
the document happened to read. A paste box takes 'S 200, M 400, L 400'
because that is how a breakdown arrives on WhatsApp.

Shipping is the opposite: sizes do NOT automatically win, or a line with a
breakdown would report nothing shipped however many times it had been. The
sizes take over the moment they carry a figure.

Each line also has a real description box for the spec, and the order has a
proper notes box rather than two rows.

The Orders list gets the numbers you want walking in: open orders and what
is tied up, profit pending, profit realised, and what the open book is
worth in cash. Pending and realised are never added together - that would
flatter every month.

The document model is now built in one shared place, lib/documents/
buildModel, so the purchase order inside a supplier pack is the same one
the print page shows.

Cut-off date and ETD move onto the order. v125 put them on the purchase
order, which is where they are PRINTED, but they are decided when the job
is planned and they are the two dates the order is chased against - an
order had no dates at all until a PO existed, and one bought from two
suppliers had two sets of them and no answer to 'when does this ship'. The
order holds them now and the purchase order is filled in from it; what is
already printed on a PO does not change when a date moves afterwards.

The list and the order page both flag them: cut-off only while the order
could still change, ETD until everything has actually gone. An ETD that
passed last week on an order still sitting in the factory is the most
useful thing either page can tell you.

Duty drawback is no longer asked for when the order is created. It appears
on the order page once goods have shipped. Before that there is nothing to
claim it against, and a rate typed in early is a guess that quietly becomes
a number somebody plans against.

Documents print in the currency they are raised in. Every amount in the
app went through one hard-coded rupee formatter, which was fine while every
document was domestic and wrong the moment a sales order went to a buyer in
USD - the figures were dollars and the symbol said rupees, which is not
cosmetic, it is a document stating the wrong price.

The rule, now in one place in lib/documents/money: sales order, proforma
and customer invoice in the customer's currency; purchase order to the
supplier in rupees; the P/L in rupees. Grouping follows the currency too -
12,34,567 is right for rupees and wrong for dollars. Raised from an order,
all three are set automatically and never asked about.

A foreign-currency document defaults to no GST, because an export under LUT
is zero-rated and leaving 18 percent on it would put a tax line on a
document that must not carry one. Still editable per line. A document with
no tax now shows no tax line at all rather than CGST zero and SGST zero,
which reads as a mistake.

INR is deliberately absent from lib/currencies - that list is the FOREIGN
currencies offered in pickers - so the rupee symbol is handled explicitly
rather than by adding INR to a list that feeds every convert-to dropdown.

Migrations v127 adds order_files, order_line_sizes and
order_lines.description; v128 adds orders.cutoff_date and orders.etd.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
