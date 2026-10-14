#!/usr/bin/env bash
#
# Chit statement: any two dates
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-statement-range.sh
#
# NO MIGRATION. Reads only.

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
git commit -m "Chit statement: any two dates, alongside the whole month

A whole month is still the default and still one click, because that is the one
that goes out on the 1st and because months do not overlap or leave gaps between
statements. The Dates button switches to two date boxes for the other question -
the one that starts 'what happened between the auction and the payout'.

The document does not change shape. Opening balance, every line, closing balance
and the reconciliation work the same over sixteen days as over a month, and the
heading reads '12 Aug 2026 to 4 Sep 2026' rather than a month name - except when
the dates happen to BE a whole month, where it still says August 2026.

Bad input is refused rather than corrected. A backwards range is not silently
swapped, a half-filled pair is not completed, and 2026-02-30 is not rounded to
the 28th: each says what is wrong and leaves the previous statement on screen.
Quietly fixing any of those produces a document whose heading is not the period
it covers, and a statement sent to ten partners is only worth anything if it
says what it did.

11 new tests, including that a range over the same dates as a month produces the
same figures as the month does.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
