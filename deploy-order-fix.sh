#!/usr/bin/env bash
#
# Fix: creating an order failed on a column it should never have touched
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-fix.sh
#
# NO MIGRATION for this fix. But v129 and v130 are still needed before
# packing and payments will work.

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
git add components/orders/OrderForm.tsx components/orders/PackingSection.tsx
git commit -m "Orders: stop asking for the over-shipment allowance up front

Two faults, one cause.

The allowance was a field on the order header, so raising an order wrote
overship_tolerance_pct - and on a database where migration v129 has not
been applied yet, creating any order failed outright with 'could not find
the column in the schema cache'. A field nobody can fill in usefully at
that moment had made the whole form dependent on a migration it did not
need.

And it was the wrong moment to ask. How much over a supplier may ship is
settled while the shipment is being packed, not while the order is being
raised, so it now sits in the Packing section where the reconciliation it
feeds already lives.

It is written with the packing and only when there is packing to measure
against, so an order with no packing never touches that column at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
