#!/usr/bin/env bash
#
# Chit: one tab bar, with Admins on it
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-onetabbar.sh
#
# NO MIGRATION. UI only.

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
git commit -m "Chit: put Admins on the tab bar the app already had

The last commit added a second tab bar under the first one, showing almost the
same links twice. My fault - HubTabs has carried the chit hub's Overview,
Groups and Members all along and I did not find it before building another.

The one I added is gone: ChitTabs, the chit layout that rendered it, and its
tab-matching module. Admins is now a tab in HubTabs alongside the other three,
which is where it should have gone in the first place.

Admins is marked ownerOnly and filtered out for a chit admin - tidiness, not
the lock, since the page redirects them and the database refuses the rows.
HubTabs also renders nothing on the forced first-password page, which offers
doors that would only bounce them back.

UI only. No migration, no change to any access rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
