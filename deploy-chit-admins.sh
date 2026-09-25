#!/usr/bin/env bash
#
# Rename: chit staff -> chit admins, manager -> partner
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-admins.sh
#
# The previous commit (131766e) shipped this feature under the wrong words.
# Nothing about how it works changes here. NEEDS MIGRATION v120 - the same
# migration, renamed, and safe to run whether or not you ran the earlier one.

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
     supabase/migration_v120_chit_admins.sql

   It widens the policies on the chit_* tables from "the owner" to "the owner,
   or someone the owner granted chit access". Nothing else changes: every other
   table keeps auth.uid() = user_id.

   It is safe to run again. If you already ran the earlier version, the table
   chit_staff is renamed to chit_admins, staff_user_id becomes admin_user_id,
   and anyone on the old "manager" role becomes "partner". If you never ran it,
   all of that is skipped and the table is simply created.

   VERIFY, before you create any admin login:

     -- 1. Only chit tables changed. Expect chit_* rows and nothing else.
     select tablename, policyname from pg_policies
      where schemaname = 'public' and policyname like '%_access'
      order by tablename;

     -- 2. The ledger is untouched. Expect the original owner-only policies.
     select tablename, policyname, qual from pg_policies
      where schemaname='public' and tablename in ('transactions','accounts','categories');

     -- 3. The old name is gone and the new one is there.
     select to_regclass('public.chit_staff')  as should_be_null,
            to_regclass('public.chit_admins') as should_exist;

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
git commit -m "Chit: call them admins and partners, not staff and managers

These are partners who run the chit with you, so the words in the app should
say that. The previous commit shipped the feature under the wrong ones.

Nothing about how it works changes. The page is /chit/admins and is titled
Chit admins; the sidebar entry is Admins; the top role is partner instead of
manager. Underneath, chit_staff becomes chit_admins, staff_user_id becomes
admin_user_id, and CAN.manageStaff becomes CAN.manageAdmins.

The migration carries over an earlier run of itself rather than assuming a
clean database: it renames the table and the column in place and moves anyone
on manager to partner, all guarded, so it is safe whether or not v120 was
already applied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
