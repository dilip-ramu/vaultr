#!/usr/bin/env bash
#
# Chit: a copyable handover message, and a member portal that actually opens
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-access.sh
#
# NO MIGRATION.
#
# AFTER DEPLOY, set this in Vercel if it is not already set:
#   NEXT_PUBLIC_SITE_URL = https://inex-mu.vercel.app
# Without it, links are built from request headers. That usually works, but a
# preview deployment would put a preview address into somebody's WhatsApp.

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
git commit -m "Chit: hand over access without it failing silently

Two things, both about somebody else being able to get in.

CREATING A LOGIN now ends with the message to send. The password exists in
readable form exactly once - the moment the owner types it, before Supabase
hashes it - so the message has to be built then or not at all. One block, copied
whole, because a login handed over in three WhatsApp messages is how a password
ends up in the wrong thread. The panel says plainly that closing it without
sending means setting a new password. Resetting a password does the same.

THE MEMBER PORTAL never worked, and this is why: redeeming the invite happened
on the GET. Every messaging app fetches a link to build its preview card, so
WhatsApp spent the single-use token the moment the message was sent, and the
member tapped a link that was already used. The portal was not broken - it
worked once, for a robot.

So /m/enter is now a page that changes nothing. It looks the invite up, greets
the member by name, and waits. Spending it needs a POST, which no preview bot
sends. The redirect after that POST is a 303, not the default 307, or the
browser would re-post to the page it lands on.

The link also lasted thirty minutes, which assumed the member was holding their
phone when you pressed send. Seven days now.

And there was no way back in: single-use link, expiring session, so a member on
a new phone had to ask for another link. That is not a login. /m/signin takes
the number they already gave you and the PIN they set on their first visit -
matched on the last ten digits, because nobody writes a number the same way
twice, and refused outright when two members share one rather than guessing
which. Wrong number and wrong PIN say different things, or someone who mistyped
their own number burns five attempts and locks themselves out of an account they
were never in.

36 new tests, including that a preview can read a link twice and the member can
still use it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
