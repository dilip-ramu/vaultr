#!/usr/bin/env bash
#
# Invoices cleanup, step 1: park what nothing uses.
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash simplify-invoices-step1.sh
#
# NOTHING GOES ON main. This commits to a branch, so main stays exactly as it
# is until you merge it yourself. NO MIGRATION.
#
# To undo at any point: bash restore-invoices-cleanup.sh

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

BRANCH="simplify/invoices-cleanup"

hr "0. What this removes"
cat <<'LIST'
   Four files. Nothing in the app renders any of them:

     components/customers/invoices/InvoicesTabsBar.tsx            192 lines
     components/reimbursables/ReimbursableHistoryClient.tsx       448 lines
     components/reimbursables/ReimbursableInvoicePDF.tsx          416 lines
     components/reimbursables/ReimbursableInvoicePDFDownload.tsx   46 lines

   The react-pdf invoice was the only one worth a second look: your
   reimbursable invoice PDF has come from the print route and the shared
   document design since ReimbursableDownloadButton was written, and that
   old layout was still being compiled because one TYPE lived inside it.
   The type moved to components/reimbursables/reimbursableInvoiceData.ts
   and nothing else changed.

   All four are MOVED to _to_delete/invoices-cleanup/, not deleted, and they
   are in git history as well. tsconfig now ignores _to_delete so parked
   files cannot fail a typecheck.

   WHAT THIS DOES NOT TOUCH: every screen, route, button and PDF you can
   reach in the app. react-pdf itself stays — payroll slips, cheques and the
   exports still use it.
LIST
read -r -p "   Go on? [yes/no] " go
[ "$go" = "yes" ] || die "stopping at your request"

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. Branch"
git rev-parse --verify "$BRANCH" >/dev/null 2>&1 \
  && git checkout "$BRANCH" \
  || git checkout -b "$BRANCH"
echo "   on $(git rev-parse --abbrev-ref HEAD)"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok
[ "$ok" = "yes" ] || die "stopping at your request — nothing committed"

hr "7. Commit on the branch"
git add -A
git commit -m "Invoices: park four files nothing renders

1,102 lines that no route, component or script reaches:

  InvoicesTabsBar                - the tab bar the chooser replaced
  ReimbursableHistoryClient      - the old reimbursement history screen
  ReimbursableInvoicePDF         - the react-pdf invoice layout
  ReimbursableInvoicePDFDownload - a download button with no caller

The react-pdf layout is the one that matters. The reimbursable invoice PDF
has come from /reimbursables/invoices/[id]/print and the shared document
design since ReimbursableDownloadButton was written - 'no new tab, no
react-pdf', as that file says. The old layout survived only because one
type was declared inside it, so every build still compiled a 416-line
renderer that produced nothing. The type is now its own file.

That also means invoices have ONE renderer again: the print route and the
jsPDF document design, the same one the POs and sales orders use, so a
layout fix lands in one place instead of three. react-pdf stays for the
payroll slips, the cheques and the exports.

Parked in _to_delete/ rather than deleted, and tsconfig ignores that folder
so a parked file cannot fail the typecheck. Nothing a screen can reach was
touched; typecheck, 1383 tests and the production build all pass.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"

hr "Done"
cat <<'NEXT'
   Committed on simplify/invoices-cleanup. main is untouched.

   Worth clicking before you merge (npm run dev):
     - Invoices: all three flows, the list, courier batches
     - A reimbursable invoice: Download PDF, and Open print page
     - A courier invoice PDF, and any PO or sales order PDF

   Happy:          git checkout main && git merge simplify/invoices-cleanup && git push origin main
   Changed my mind: bash restore-invoices-cleanup.sh
NEXT
