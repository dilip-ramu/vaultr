#!/usr/bin/env bash
#
# No more overlapping letters in any generated PDF + cut-off date and ETD on POs
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-po-dates.sh
#
# MIGRATION: supabase/migration_v125_po_dates.sql  (run it FIRST, in the
# Supabase SQL editor — the form saves two new columns and will fail without
# them).
#
# Note: this script commits ONLY the files for this change. selfhost/ and the
# .gitignore edit from the Mac-mini work are left alone on purpose.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Did you run migration v125?"
read -r -p "   supabase/migration_v125_po_dates.sql applied? [yes/no] " mig
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
  lib/pdf/textBlock.ts \
  lib/pdf/renderDocModelPdf.ts \
  lib/documents/extraDates.ts \
  lib/documents/adapters.ts \
  lib/documents/layout.ts \
  lib/documents/layoutContext.ts \
  components/documents/DocumentForm.tsx \
  "app/(app)/suppliers/documents/[type]/[id]/edit/page.tsx" \
  "app/(app)/customers/documents/[type]/[id]/edit/page.tsx" \
  lib/__tests__/pdf-text-block.test.ts \
  lib/__tests__/doc-extra-dates.test.ts \
  supabase/migration_v125_po_dates.sql
git commit -m "PDFs: stop text printing on top of text, everywhere

The purchase order had the company name sitting on its address and the
address running under PURCHASE ORDER. The cause was the same three lines
repeated through the renderer: jsPDF splitTextToSize returns an ARRAY of
wrapped lines, doc.text draws every one of them, and the loop then moved
down by a single line. A block that wrapped to three lines got one line of
room, so whatever came next was printed over it.

That renderer draws every document - quotation, proforma, PO, credit and
debit note, challan - so the fix is one text-block helper that wraps to a
width, draws each line at its own y, and hands back the y underneath. The
company block, the party block, the bank block, terms, the table cells and
the amount in words all go through it. The arithmetic lives in
lib/pdf/textBlock.ts, away from jsPDF, so it can be tested.

Two blocks that start on the same line - company vs title, amount in words
vs the totals - now advance past the taller of the two instead of only the
right-hand one.

The left-hand blocks are also given a width that stops short of the right
column, so a long company name wraps instead of running into the title.

Cut-off date and ETD on purchase orders

Both used to go in the notes box, where they print as prose and nothing can
read them back. They are now their own optional date fields: they show in
the document header beside the date, they are placeable on a designed
template, and they are stored as dates so the database refuses nonsense.

Which type carries which extra date is one list in lib/documents/extraDates
- adding ETD to sales orders later is one line, and the form, the PDF and
the template designer all pick it up.

Migration v125 adds documents.cutoff_date and documents.etd.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
