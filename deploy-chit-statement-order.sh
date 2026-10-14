#!/usr/bin/env bash
#
# Chit statement: newest first
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-statement-order.sh
#
# NO MIGRATION of its own. If v123 (who recorded it) is not applied yet, run it
# first — the previous deploy carries it.

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
git commit -m "Chit statement: print it newest first, the way a statement reads

The transaction list ran oldest to newest. A bank statement runs the other way,
and so should this - the most recent movement is what anyone opening it wants
first.

The model still holds the lines in date order, because a running balance can
only be computed forwards. Only the printing is reversed.

The part worth being careful about is what the balance column means. It means
'the balance AFTER this transaction', and reversing the rows must not reverse
that: the closing balance now sits at the TOP of the table and the opening
balance at the BOTTOM, which is exactly how a bank prints it. Getting that wrong
would produce a column that looks right and reads backwards, which is the worst
kind of wrong in a document whose whole job is to be checkable.

Four tests on the reversal alone, including that the top row carries the closing
balance and that the model it was handed is left untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
