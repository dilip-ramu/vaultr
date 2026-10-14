#!/usr/bin/env bash
#
# Chit: partners can open the statement, and every entry says who logged it
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-statement-access.sh
#
# NEEDS MIGRATION v123. Read step 5 before answering yes.

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
     supabase/migration_v123_chit_recorded_by.sql

   Adds two columns each to chit_collections and chit_auctions:
   recorded_by_user_id and recorded_by_name. Nothing is dropped or rewritten.

   Existing rows are left blank ON PURPOSE. Backfilling them with your name
   would be inventing evidence - they predate the question, and a dash is the
   honest answer. Everything recorded from now on carries a name.

   VERIFY:
     select count(*) as rows,
            count(recorded_by_name) as named
       from chit_collections;
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply and verify the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit: partners can open the statement, and entries say who logged them

TWO THINGS.

PARTNERS CAN OPEN THE STATEMENT. It was owner-only on the reasoning that it
carries the bank balance and every movement in the account including non-chit
ones. But partners are shareholders and the statement is the document written
FOR them - withholding it from the people it is addressed to is an odd kind of
transparency. It stops there: a collector records payments and a viewer reads
the chit, and neither needs the balance of a bank account.

That is CAN.viewStatement, in the same pure permission table as everything
else, so the page, the tab and the sidebar all ask one question instead of
three. Tab visibility now follows what a role may do rather than 'is an admin at
all', which is what it should have been from the start.

WHO RECORDED IT. With one person running the chit this never came up. With
partners and collectors across several groups it is the first question asked
about anything that looks wrong, and the books could not answer it: a row said
what happened and when, not who.

Collections and auctions now carry recorded_by_user_id and recorded_by_name. The
name is denormalised deliberately - this is a historical record, and if an
admin's access is removed next year every collection they took must still say
they took it. A join to a live table would turn those into 'unknown' exactly
when somebody is trying to reconstruct what happened.

It shows on each payment in the group, and as a Recorded by column in the
statement PDF. A dash means the line did not come through the chit, or predates
this being tracked. A name is never guessed, and existing rows are not
backfilled, because filling them in with the owner would be inventing evidence.

Adds migration v123.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
