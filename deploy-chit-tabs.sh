#!/usr/bin/env bash
#
# Chit tabs: Overview, Groups, Members, Admins
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-tabs.sh
#
# NO MIGRATION. This is UI only - nothing about access or the database changes.

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
git commit -m "Chit: one row of tabs instead of a sidebar sub-menu

Groups, Members and Admins were sub-items under Chit funds in the sidebar,
which meant expanding a menu to reach them - and on a narrow screen, not
reaching them at all. The Admins page in particular was effectively hidden.

Every page under /chit now carries the same row of tabs at the top: Overview,
Groups, Members, and Admins for the owner only. It lives in the chit layout, so
a page added later cannot forget it and the tabs cannot drift out of step
between pages.

Which tab is lit is a pure rule in lib/chit/tabs.ts with its own tests, because
it is exactly the kind of thing that quietly breaks when a page is added: a
group's own page keeps Groups lit, /chit lights only Overview, and a path that
merely starts with a tab's href - /chit/membership - lights nothing of Members.

Admins is hidden from a chit admin, which is convenience rather than the lock:
the page already redirects them and the database already refuses the rows. The
tabs disappear entirely on the forced first-password page, which has one job.

UI only. No migration, no change to any access rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
