#!/usr/bin/env bash
#
# Chit: dues as a running balance, and credit that belongs to the member
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-credit.sh
#
# NEEDS MIGRATION v124. Read step 5 before answering yes.
# If v122 (auction time) or v123 (recorded by) are not applied yet, run those
# first — this deploy carries their code too.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v124_chit_credit_moves.sql

   Creates ONE table, chit_credit_moves. Nothing existing is altered or
   rewritten. No credit balance is stored anywhere - it is computed from the
   collection rows you already have, so nothing needs backfilling and nothing
   can drift out of step with the payments it came from.

   VERIFY:
     -- The table exists and is empty, which is correct.
     select count(*) from chit_credit_moves;

     -- Collections are untouched.
     select count(*) from chit_collections;
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply and verify the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit: dues become a running balance, and credit follows the member

Someone hands over 20,000 against an 18,600 due. The old model asked one
question per slot - paid, or not - so they were marked paid and the extra 1,400
sat in the bank with nothing pointing at it. Someone paying 10,000 could not be
recorded at all without claiming they had paid in full.

The question is now 'paid how much against owed how much'. After any month a
member is ahead or behind by everything they have paid less everything that has
fallen due. Ahead reduces next month FOR THEM ONLY; behind carries as arrears;
part payments become recordable. Nothing is stored - a kept balance is a number
that can drift from the payments it came from, and when it does nobody can tell
which one is lying.

CREDIT BELONGS TO THE PERSON, NOT THE CHIT. One member can be in several, so
credit never moves on its own: the owner applies it, out of a named chit, into
a named chit, against a named month. One row, so it cannot be spent twice, and
nothing silently takes it from whichever chit happens to be listed first. A move
out of a chit with no credit is refused rather than quietly sourced elsewhere.
Credit and arrears are never netted off - being 1,400 ahead in one and 18,600
behind in another is two facts, and the difference alone hides both.

A collection's amount can now be corrected in place. The bank entry moves by the
difference rather than to the new figure, because a consolidated payment carries
other months that must not be disturbed, and if the collection update then fails
the money is put back.

One calculation, four screens. The collection tab, the member page, the
statement and the dashboard all read the same ledger, because computing this
four times is how four screens come to disagree about money.

Collections now default to the Unyra Capital account, and the statement and the
collection screens share one definition of which account that is - they had
separate copies, which is how collections could post somewhere the statement
does not read. The chit account is also always offered now, whichever company
it is filed under.

49 new tests. One of them exists because the walkthrough caught a real bug:
credit taken off at the END of the month walk left every month in between still
discounted, so a member whose credit had been moved to another chit got the same
1,400 off in both.

Adds migration v124.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
