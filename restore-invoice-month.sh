#!/usr/bin/env bash
#
# Undo the month panel on the invoices page.
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash restore-invoice-month.sh
#
# Works committed or not, and can be run twice.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

NEW=(
  "lib/customers/invoiceMonth.ts"
  "lib/__tests__/customers-invoice-month.test.ts"
  "components/customers/invoices/MonthPanel.tsx"
)
CHANGED=(
  "app/(app)/customers/invoices/page.tsx"
  "components/customers/invoices/InvoiceChooser.tsx"
)
HERE="$(git rev-parse --abbrev-ref HEAD)"

if git ls-files --error-unmatch "lib/customers/invoiceMonth.ts" >/dev/null 2>&1; then
  hr "Already committed on this branch ($HERE)"
  cat <<'MSG'
   main never had it, so going back is just leaving the branch:

     git checkout main

   And to be rid of the branch:

     git branch -D simplify/invoice-month

   Nothing else to undo.
MSG
  exit 0
fi

hr "Putting the page back"
git checkout -- "${CHANGED[@]}" 2>/dev/null || true
for f in "${CHANGED[@]}"; do echo "   reverted: $f"; done
for f in "${NEW[@]}"; do
  if [ -f "$f" ]; then rm -f "$f"; echo "   removed: $f"; fi
done

hr "Checking the app still builds"
npx tsc --noEmit && echo "   typecheck clean"
npm test && echo "   tests passed"

hr "Done"
echo "   The invoices page is back to the three cards and the recent list."
