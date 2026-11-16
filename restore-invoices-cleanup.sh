#!/usr/bin/env bash
#
# Undo the invoices cleanup, whatever state it is in.
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash restore-invoices-cleanup.sh
#
# Works whether or not the cleanup was committed, and can be run twice.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

NEWFILE="components/reimbursables/reimbursableInvoiceData.ts"
BRANCH="simplify/invoices-cleanup"
HERE="$(git rev-parse --abbrev-ref HEAD)"

# Was the cleanup already committed? If the new types file is tracked, yes.
if git ls-files --error-unmatch "$NEWFILE" >/dev/null 2>&1; then
  hr "The cleanup is committed on this branch ($HERE)"
  cat <<'MSG'
   main never had it, so going back is just leaving the branch:

     git checkout main

   And if you want the branch gone for good:

     git branch -D simplify/invoices-cleanup

   Nothing else to undo — main still has all four files.
MSG
  exit 0
fi

hr "Putting the files back"
# Anything git knows as deleted or changed comes back from the last commit.
git checkout -- \
  components/customers/invoices/InvoicesTabsBar.tsx \
  components/reimbursables/ReimbursableHistoryClient.tsx \
  components/reimbursables/ReimbursableInvoicePDF.tsx \
  components/reimbursables/ReimbursableInvoicePDFDownload.tsx \
  components/reimbursables/ReimbursableInvoiceClient.tsx \
  tsconfig.json 2>/dev/null || true
for f in components/customers/invoices/InvoicesTabsBar.tsx \
         components/reimbursables/ReimbursableHistoryClient.tsx \
         components/reimbursables/ReimbursableInvoicePDF.tsx \
         components/reimbursables/ReimbursableInvoicePDFDownload.tsx; do
  if [ -f "$f" ]; then echo "   back: $f"; else echo "   MISSING: $f"; fi
done

# The types file was new, so it goes rather than reverts.
if [ -f "$NEWFILE" ]; then rm -f "$NEWFILE"; echo "   removed: $NEWFILE"; fi

hr "Checking the app still builds"
npx tsc --noEmit && echo "   typecheck clean"
npm test && echo "   tests passed"

hr "Done"
cat <<'MSG'
   Everything is as it was before the cleanup.

   The parked copies are still in _to_delete/invoices-cleanup/. Git ignores
   that folder, so they are harmless; delete it in Finder whenever you like.
MSG
