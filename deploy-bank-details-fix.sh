#!/usr/bin/env bash
#
# Invoices — never print another company's bank account
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-bank-details-fix.sh
#
# NO MIGRATION.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(print)/recoverables/invoices/[id]/print/page.tsx"
  lib/__tests__/invoice-bank-details.test.ts
)

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. Commit and push"
git add -- "${FILES[@]}"
git commit -m "Never print another company's bank account on an invoice

Tax invoices merged the chosen company over the legacy single-row settings for
every field, bank details included. So an invoice issued from a company whose
bank fields were empty printed whatever account number that old settings row
held — silently, on every invoice, whichever company was selected. A customer
paying it pays the wrong account.

Branding still falls back: a company without an address borrowing the legacy one
costs a stale line on a document. An account number is not in that category.
Once an invoice names a company its bank details come from that company or not
at all; the legacy row is used only for invoices predating companies that carry
no company_id.

Printing no bank block is a nuisance. Printing the wrong one is a misdirected
payment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
