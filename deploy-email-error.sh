#!/usr/bin/env bash
#
# Payroll email: say what actually went wrong
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-email-error.sh
#
# NO MIGRATION. This does NOT fix the failed send — that is a setting in Brevo,
# see the note at the end. This makes the next failure explain itself.

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
git commit -m "Payroll email: translate the provider's refusal into an instruction

A blocked send showed the user Brevo's own prose, cut off at 200 characters:
'...make sure to add the new IP address in this link: h'. There is nothing in
that anybody can act on, and the fix is a setting in somebody else's dashboard.

This is the second time the same wall has been hit, with a different IP each
time, which is the tell: the sending address is not stable and never will be,
because the app runs on serverless functions that get a fresh one on every cold
start. So the message now says that approving the address will NOT stop it
happening again, and gives the path to the setting that will.

Other failures are translated too - a plain 401 points at the key and the
sender verification, a 429 says wait rather than go changing settings, and a
5xx says it is their end so nobody goes hunting here. An unrecognised error
keeps a short piece of the original, because a message with nothing concrete in
it cannot be searched for.

Pure module with 12 tests, including that the half-sentence never reaches the
reader again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main

hr "AFTER DEPLOYING"
cat <<'MSG'
   This deploy does not make the email send. Do this in Brevo:

     Settings → Security → Authorized IPs → Deactivate for API keys

   (Inex calls Brevo's REST API, so that is the toggle. SMTP keys is already
   deactivated and can stay that way.)

   Then send the salary slip again.
MSG
