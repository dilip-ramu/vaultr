#!/usr/bin/env bash
#
# The rate you actually got on a customer receipt
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-order-receipt.sh
#
# MIGRATION FIRST: run supabase/migration_v131_receipt_rate.sql in the
# Supabase SQL editor, then run this. It is re-runnable.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "0. Migration"
echo "   supabase/migration_v131_receipt_rate.sql must already be run."
read -r -p "   Done? [yes/no] " m
[ "$m" = "yes" ] || die "run the migration first"

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
git commit -m "Orders: work out the rate a receipt actually got, don't type it

An export invoice is in dollars and the money arrives in rupees, so the rate
on the contract is never the rate you got. The bank's rate is, less its
charges, against whatever the customer actually settled. That is three
figures off one bank advice, so it is worked out rather than typed:

  rate = (rupees received - bank charges) / (invoice value +/- adjustment)

Which side an adjustment lands on is decided by its currency, and that is the
one judgement in here. An adjustment in the order's currency changes what was
settled, so it goes in the denominator - a customer short-paying \$500 settled
\$47,500 of a \$48,000 invoice. An adjustment in rupees changes the rupees, so
it goes in the numerator; converting it would need the very rate being
calculated. Either way an addition raises its side and a deduction lowers it.

The bank entry posted is the net - remittance less charges - so it matches the
statement rather than the advice.

lib/orders/receipt.ts is pure and tested (22 cases): the rate, the workings
shown under the form, and a blended rate across every receipt on the order,
weighted by what each one settled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
