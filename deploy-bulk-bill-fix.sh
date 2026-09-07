#!/usr/bin/env bash
#
# Suppliers > Invoices — fix bulk "Mark Billed"
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-bulk-bill-fix.sh
#
# NO MIGRATION.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  app/api/supplier-invoices/bulk-bill/route.ts
  app/api/supplier-invoices/bulk-recovered/route.ts
  components/suppliers/invoices/SupplierInvoicesClient.tsx
  lib/__tests__/supplier-bulk-bill.test.ts
)

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. Commit and push"
git add -- "${FILES[@]}"
git commit -m "Fix bulk Mark Billed on supplier invoices

Selecting several bills and pressing Mark Billed changed only some of them, or
none, with no message — so each line had to be done by hand.

The bulk action required recoverable_status to equal the exact string
'pending_billing'. That column has no default (migration v15: NULL when not
recoverable), so any recoverable bill created without the field explicitly set
sits at NULL and matched nothing. The single-row button never checked the status
at all, which is why one at a time worked and a selection did not.

Eligibility is now 'recoverable and not already billed or settled', so NULL and
partial_recovery are included. The button's count uses the same rule, so the
number on the button is the number that will change.

The action also reported nothing at all when it matched no rows, and treated a
failed request as success. It now says how many were marked and how many were
skipped, surfaces server errors, and updates only the rows the database says it
actually changed — bulk-bill and bulk-recovered now return updated_ids rather
than a bare success flag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
