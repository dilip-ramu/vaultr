#!/usr/bin/env bash
#
# Chit: monthly partner statement PDF
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-statement.sh
#
# NO MIGRATION. Reads only; writes nothing.
#
# NOTE: the statement is built from the account named exactly "Unyra Capital".
# If no account has that name the page says so and lists the names it found.

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
git commit -m "Chit: a monthly statement partners can check

Ten partners share this business and one of them owns the app. That is an
uncomfortable position to be in when a question about money comes up two years
from now, so once a month every partner can be sent the same document, built
from the ledger rather than from anybody's summary of it.

Two rules shaped it.

Nothing in it is a claim. Every figure is a sum of transactions in the Unyra
Capital account, and the arithmetic is printed - opening, plus in, minus out,
equals closing - so a partner holding the bank's own statement can tick each
line. Where the app's live balance can meaningfully be compared, it is, and the
result is stated either way.

The awkward rows are the point. A statement listing only collections and
payouts would hide exactly what a partner wants explained: the transfer out,
the bank charge, the withdrawal. So every transaction in the account is listed
and anything that is not a chit collection or payout is marked Other and
totalled separately. Classification comes from the chit row that points at the
transaction, not from its description, so renaming one cannot move it out of
the count. When there are none, the statement says so in words.

It also names the gaps rather than smoothing them: collections recorded in the
chit books with no transaction behind them, and auctions held but not yet paid.
Outstanding dues are measured only against auctions that have actually run,
because a month that has not been auctioned owes nothing.

lib/chit/statement.ts is pure and carries 33 tests, including that the three
arithmetic identities hold on every scenario. Owner only: the document is meant
to be sent to partners, not browsed by a chit admin who has no business reading
the bank balance.

Statement is a new tab under Chit funds. No migration; reads only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
