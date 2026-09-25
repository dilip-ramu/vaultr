#!/usr/bin/env bash
#
# Chit: permanent member links, foreman bidding, and closing that records
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-auction-flow.sh
#
# NEEDS MIGRATION v121 — one new column. Read step 5 before answering yes.

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
     supabase/migration_v121_chit_permanent_links.sql

   It adds ONE column, chit_members.portal_token, and a unique index on it.
   Nothing is dropped, nothing is rewritten, no policy changes.

   VERIFY:
     -- 1. The column is there.
     select column_name from information_schema.columns
      where table_name = 'chit_members' and column_name = 'portal_token';

     -- 2. Nobody has a link yet. Links are created when you press Send link.
     select count(*) from chit_members where portal_token is not null;

   NOTE: every link you sent before this stops working. They were single-use
   and most were already spent. Press "Send link" again for each member — the
   new one is permanent, so this is the last time.
MSG
read -r -p "   Migration applied and verified? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply and verify the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit: links that last, bidding you can run, closing that records

FOUR THINGS, and they hold together rather than sitting side by side.

THE LINK IS PERMANENT. It was single-use and expiring, which read as careful
and behaved as broken: tap it twice, change phone, clear the browser, and the
member is locked out asking for another. Members are members for five years.

The secret moved rather than disappeared. The link says WHO you are; the PIN
proves you ARE them, and is now asked at the door - once per device - instead
of once per action. A link forwarded to the wrong person opens nothing once its
owner has set a PIN. The token is stored in plain text on purpose: hashing it
would mean never being able to show a member their own link again, only replace
it, and 'I lost the message' is the everyday case. Rotating is there for the
day a link really does go astray, and it signs every device out too, because a
new link means nothing while the old sessions still work.

NO PIN ON EVERY BID. That was right when the link was the only guard. It is not
right now, and it meant typing four digits between each raise while an auction
ran. The session cookie is the proof, and it was only issued to somebody who
entered the PIN.

THE FOREMAN CAN BID FOR A MEMBER - one in the room, or on the phone. Same rules
exactly; recorded as source 'foreman' rather than disguised as the member's own
tap, because the bid log is what settles an argument later and a bid nobody can
account for settles nothing.

CLOSING RECORDS THE AUCTION. It used to stop new bids and print who was
highest, leaving that to be retyped into the auction form - a mistyped figure,
or a close nobody follows up, on the one record that decides who gets a lakh.
Closing now writes winner, discount, commission, dividend and payout through
the same runAuction maths as the manual form; toParams was a private copy in
that route and is now shared, so the two cannot drift. Closing still does not
PAY anybody - that stays separate, because that is where money leaves. Nobody
bid, already paid out, and the write failing are each reported in words rather
than left to be noticed.

Who is leading is now one function used by both the member's live screen and
the close, so the name on the phone during the auction is the name in the books
after it. A past winner keeps watching the auction live and is told they can -
they simply cannot bid.

Adds migration v121: one column, chit_members.portal_token.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
