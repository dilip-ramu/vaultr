#!/usr/bin/env bash
#
# Orders: how the pieces go into cartons
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-packing.sh
#
# MIGRATION: supabase/migration_v129_order_packing.sql  (run it FIRST)

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Migration"
read -r -p "   supabase/migration_v129_order_packing.sql applied? [yes/no] " mig
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
  lib/orders/packing.ts \
  lib/orders/summaryDoc.ts \
  lib/documents/model.ts \
  lib/documents/adapters.ts \
  lib/pdf/renderDocModelPdf.ts \
  lib/__tests__/orders-packing.test.ts \
  lib/__tests__/orders-summary-doc.test.ts \
  components/orders/PackingSection.tsx \
  components/orders/OrderForm.tsx \
  components/orders/OrderSheet.tsx \
  components/documents/DocumentForm.tsx \
  "app/(app)/orders/[id]/page.tsx" \
  "app/(app)/orders/[id]/edit/page.tsx" \
  "app/(app)/suppliers/documents/[type]/new/page.tsx" \
  supabase/migration_v129_order_packing.sql
git commit -m "Orders: how the pieces go into cartons

A garment order is sizes; a shipment is cartons. '400 pieces' does not tell
a supplier what to put in a box, so the order carries the packing and the
purchase order prints it as a table without rules:

  Box 1   20 boxes   S-1, M-2, L-2, XL-1  (Polo navy)
  Box 2   10 boxes   S-20                 (Polo navy)
  Box 3   20 boxes   S-1, M-2, L-2, XL-1  (Polo navy)
                     S-1, M-2, L-2, XL-1  (Crew tee)

FOUR CASES, ONE CALCULATION. A pack is a SET of contents, how many sets go
in one box, and how many boxes: solid is one content row, assorted is
several, two assortments to a box is sets=2, and a box that mixes styles is
rows on different lines. Writing those separately would be four chances to
get a box count wrong, and the box count is what the factory ships against.

A PACK BELONGS TO THE ORDER, NOT TO A LINE, because a box holding two
styles belongs to neither of them. A mixed box gets one line PER STYLE
rather than one long run of sizes - the packer fills it style by style, and
S-1, M-2, S-1, M-2 with the styles buried in it is how the wrong garment
goes in. The style is named only when the packing involves more than one.

It reconciles per style AND per size, never on the total: twenty too many
smalls and twenty too few larges comes to exactly the right number of
pieces and the wrong shipment. The form says what is left, offers 'fill the
rest' - limited by the tightest line in the set, so S1 M2 L2 XL1 against
100 of each offers fifty boxes, not a hundred - and warns, rather than
refusing, when the packing goes over.

HOW MUCH OVER IS ALLOWED IS NEGOTIATED. A supplier may be permitted to ship
a few per cent extra on one order and none at all on the next, so the
figure is a field on the order and defaults to none. An allowance nobody
agreed is an allowance that does not exist, and a number baked into the
code would quietly excuse an overshipment on an order that never allowed
one. Over within the agreed figure is amber; past it is red.

The purchase order keeps its OWN COPY of the packing, taken when it is
raised. What is printed on a document already sent to a supplier must not
change because somebody moved a box count afterwards.

Also: model.note is now drawn. Every adapter carried it and nothing
rendered it, so a note typed on any document went into the database and
never onto the paper.

Migration v129 adds order_packs, orders.overship_tolerance_pct and
documents.packing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
