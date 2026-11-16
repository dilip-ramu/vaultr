#!/usr/bin/env bash
#
# The company's GST rate reaches the documents
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-gst-default.sh
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
git commit -m "GST: one rule for the starting rate, and the company's own rate is part of it

The rate set on the company never reached a sales order or a purchase order.
Those documents came off an order through orderDocLines, which defaulted the
rate to 18 - so a company set to 5% got 18%, and a USD sales order got Indian
GST on a document that must not carry a tax line at all.

The rule now lives in one function, defaultGstFor(currency, companyRate),
used by every document form:

  1. another currency  -> 0, because an export under an LUT is zero-rated
  2. otherwise          -> the company's own CGST + SGST
  3. otherwise          -> 18

Currency wins over the company on purpose. Both are defaults; every line
stays editable.

orderDocLines no longer has a default tax rate at all. It was the silent 18
that caused this, so the caller now has to say what the rate is.

Two smaller ones of the same family: a company rate of null read as 0 rather
than 'not set', which would have quietly nil-rated every company that has no
rate; and 'parseFloat(x) || 9' in the company form turned a deliberate 0%
into 9%, so a nil-rated company could not be saved as one.

Changing the company on a document now moves the lines still sitting at the
old company's rate, and leaves a rate typed by hand alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
