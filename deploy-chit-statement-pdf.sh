#!/usr/bin/env bash
#
# Chit statement: real A4 pages, and a filename that says the period
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-statement-pdf.sh
#
# NO MIGRATION.

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
git add -A
git commit -m "Chit statement PDF: cut the pages where the content allows

The statement was rasterised into one tall image and sliced every 297mm. That
is right for an invoice, which is designed to be one page, and wrong for a
statement, which is as long as the month was - so pages broke through the middle
of a transaction row and sheared a balance figure in half. A reader cannot tell
that from a number that has gone wrong, which is precisely the doubt this
document exists to remove.

The paper no longer decides where to cut; the content does. Every block and
every row carries data-pdf-break, and a page ends at the last safe offset that
still fits. Where one block is taller than a whole page there is nothing to be
done, so it cuts at the edge rather than refusing to produce a document.

Pages now have real margins instead of bleeding to the paper edge, and each one
is footed with the account, the period and 'Page n of m' - a statement gets
printed and passed around, and unnumbered pages can be reordered or lost
without anybody noticing.

The file is named for the period it covers rather than the day it was made:
UC-Statement-2026-08-01-to-2026-08-31.pdf. ISO dates because a folder of these
then sorts chronologically on its own, which 01-08-2026 does not.

chooseBreaks is pure with 11 tests - that no page exceeds the paper, that the
slices cover the document with no gap or overlap, and that a repeated offset
cannot stall the loop. Verified against the real geometry too: a 26-member month
breaks at 1121px on a page that holds 1145, which is a row boundary rather than
the page edge.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
