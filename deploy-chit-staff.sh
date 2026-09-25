#!/usr/bin/env bash
#
# Chit-only staff logins
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-staff.sh
#
# NEEDS MIGRATION v120. It changes the row-level policies on the chit_* tables,
# so read the verification block before answering yes.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION — read this one properly"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v120_chit_staff.sql

   It widens the policies on the chit_* tables from "the owner" to "the owner,
   or someone the owner granted chit access". Nothing else changes: every other
   table keeps auth.uid() = user_id.

   VERIFY, before you create any staff login:

     -- 1. Only chit tables changed. Expect chit_* rows and nothing else.
     select tablename, policyname from pg_policies
      where schemaname = 'public' and policyname like '%_access'
      order by tablename;

     -- 2. The ledger is untouched. Expect the original owner-only policies.
     select tablename, policyname, qual from pg_policies
      where schemaname='public' and tablename in ('transactions','accounts','categories');

     -- 3. Nobody has access yet, which is correct.
     select count(*) from chit_staff;

     -- 4. Group deletion stayed with you.
     select policyname, permissive from pg_policies
      where tablename = 'chit_groups' and cmd = 'DELETE';

   ALSO: SUPABASE_SERVICE_ROLE_KEY must be set in Vercel. Creating a login uses
   the Supabase admin API, and collections post to your books through it.
MSG
read -r -p "   Migration applied and all four checks look right? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply and verify the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit-only staff logins

Inex was built for one person: a row is yours because your id is stamped on it,
which is why it has never needed permissions. A second person signing in
therefore saw an empty app, not the chit books. Giving someone chit-only access
is not a matter of hiding menus.

chit_staff records who may act inside whose chit books. One function,
chit_has_access, drives the row-level policies on the chit_* tables and nothing
else - transactions, accounts, invoices, payroll and investments keep
auth.uid() = user_id and stay invisible. Every chit page and route now resolves
whose books it is working in rather than assuming they belong to the signed-in
user; that is 14 files.

Recording a collection still posts income, so the general ledger is written on
the owner's behalf with the service role AFTER the grant and the role are both
checked - rather than widening the ledger's own policies. The account picker is
read the same way.

Roles: manager runs the chit, collector records payments only, viewer reads.
Deleting a group is owner-only in the app AND by a restrictive database policy,
because deleting one takes its auctions and collections with it. The permission
table is a pure module so every role can be tested exhaustively, including that
no staff role can ever manage staff or delete a group.

Logins are created by the owner with a first password, as asked. Because
somebody other than the account holder therefore knows it, the account is
flagged must_change_password and nothing in the chit opens until they replace
it.

proxy.ts now also sets x-pathname so the layout can redirect staff away from
non-chit URLs. Next 16 allows only one proxy/middleware file, so this rides
along with the existing Supabase session refresh. It does no auth work and
holds no logic: if it never ran, the database would still refuse every
non-chit row.

Also fixes the chit member portal. proxy.ts was redirecting every signed-out
visitor to /login, and portal members are signed out by definition — they have
a PIN, not an Inex account. /m is now exempt, in the matcher and again in the
code. That is why the invite link kept landing on the login page.

Adds migration v120.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
