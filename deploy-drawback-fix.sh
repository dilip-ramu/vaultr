#!/usr/bin/env bash
#
# Fix: duty drawback could not be entered
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-drawback-fix.sh
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
git add components/orders/OrderSheet.tsx
git commit -m "Orders: let the duty drawback actually be typed in

My fault, twice in the same card.

You said you enter drawback once the goods have shipped. That is a habit,
not a rule for the app to enforce - and I turned it into two locks. The
whole 'What really happened' card was hidden unless the order was in a
foreign currency, so on a rupee order drawback did not exist at all; and
inside it the fields were replaced by a sentence until something had been
marked as shipped.

Between them there were orders where the app asked for a number and gave
you nowhere to type it.

Now the card always shows. The exchange-rate field appears only on an
export, because there is no rate on a rupee order. The drawback fields are
always open, and the line beside the heading says which case you are in:
applies to exports on a rupee order, usually set once the goods have
shipped before despatch, can be claimed after it. Nothing hides; things
that do not apply say so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
