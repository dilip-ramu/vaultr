#!/usr/bin/env bash
#
# Customers → Invoices: one chooser, three flows
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-invoice-flows.sh
#
# NO MIGRATION. Routing and screens only — no data touched.

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
git commit -m "Customers: Invoices becomes a question, not a tab bar

Clicking Invoices showed the Couriers batch screen. The list of invoices was
two tabs away, and between them sat a tab called Reimbursables that held a
queue of expenses which were not invoices at all. Three different jobs behind
one word, and no way to tell which tab did which until you were in it.

It now asks what you are making, and each answer runs the whole job through to
an invoice.

  Courier invoice      one line per AWB, in the courier format, nothing else
  Reimbursable invoice expenses, salaries, courier charges and typed lines,
                       all on one invoice - this is the one that mixes
  Plain invoice        lines you type, nothing pulled in

The chooser says which one mixes and which does not, because picking wrong and
getting stranded was most of what was wrong before.

THE FLOW THAT PROMPTED THIS. Making a reimbursement invoice meant sorting
expenses into billing categories on one tab, then leaving, finding another tab,
pressing New, and choosing from a popup. Two halves of one job with nothing
joining them. It is now two steps of one thing: sort, continue, invoice - and
the footer says how many expenses are still unsorted, because anything left
over silently does not appear on the invoice.

Courier import was a dead end: it finished on a card offering View Batch and
Back to Dashboard, neither of which is a step towards an invoice. It is now
step 1, it carries you onward when it finishes, and it is SKIPPABLE - one CSV
is usually billed to several customers, so the second invoice off a batch must
not ask for the file again.

REVERSIBLE BY CONSTRUCTION. The step is in the URL, so the browser Back button,
the in-page Back button and a bookmarked half-finished invoice all behave the
same. Every step already reached stays clickable. At the first step Back leaves
the flow rather than doing nothing, because the commonest mistake here is
picking the wrong kind of invoice and the commonest reaction is to press Back.
Nothing is written until the step that says it writes.

Invoice detail moves to /customers/invoices/<id>. It lived under
/recoverables/ - a word that appears nowhere in the interface - so opening an
invoice dropped you out of the Customers section and the hub tabs vanished.

The builders themselves are untouched. They are wrapped as steps, not
rewritten, so the screens behave exactly as before. The Couriers batch view is
kept too, at /customers/invoices/batches, linked from the chooser: it is a
browsing view, so it loses its claim on the front page rather than its
existence.

Every old URL redirects, including the ones that were already redirects.

20 tests on the flow model: that every flow ends at an invoice, that Back is
never dead, that a stale bookmark lands somewhere usable, and that no step can
be reached with no way out.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
