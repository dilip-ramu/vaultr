#!/usr/bin/env bash
#
# Chit portal — make the login link visible, and add a self-check.
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-portal-fix.sh
#
# NO MIGRATION. This only changes how the link is built and shown.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(portal)/m/health"
  app/api/chit/portal/route.ts
  components/chit/ChitMembersClient.tsx
  lib/__tests__/lab-deadline.test.ts
)

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. Commit and push"
git add -- "${FILES[@]}"
git commit -m "Chit portal: show the login link before sending it, and add a self-check

The member login link was fired straight into WhatsApp, so nobody ever saw the
address it contained. A link built from the wrong origin looks identical inside
a chat bubble, and the member is the one who finds out it does not work.

The link is now shown first, with the address it will send and where that
address came from, plus Copy and Send buttons. A link pointing at localhost is
called out explicitly.

The origin is also derived properly: x-forwarded-host before nextUrl.origin,
because behind a proxy the internal request can carry a localhost origin and
produce a link that only works on the machine that made it. An explicit
NEXT_PUBLIC_SITE_URL still wins.

Adds a public /m/health endpoint reporting whether the portal is deployed,
whether the service-role key is set, whether the tables exist, and what address
the server is serving from. It exposes counts and booleans only — no member
data, no tokens, no hashes.

Also fixes a flaky budget test. It read callTimeout() before remaining(), and
remaining() re-reads the wall clock on every call, so the two values came from
instants a millisecond apart and the assertion failed whenever they landed
either side of a tick. The invariant was always true; the measurement was not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
echo
echo "   Once Vercel finishes, open:  <your address>/m/health"
