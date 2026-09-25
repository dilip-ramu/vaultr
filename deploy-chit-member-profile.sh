#!/usr/bin/env bash
#
# Chit members — member numbers, fuller profiles, and a member page
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-member-profile.sh
#
# NEEDS MIGRATION v119.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION — apply before continuing"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v119_chit_member_profile.sql

   It gives every existing member a number, in joining order. Check it:

     select member_code, name, phone
       from chit_members
      order by member_code;

   Expect UC00001 upwards with no gaps and no repeats.
MSG
read -r -p "   Migration applied and checked? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Chit members: member numbers, fuller profiles, and a member page

Members now carry a number (UC00001 upwards), bank details for paying their
prize, and a link to the member who introduced them. Existing members are
backfilled with numbers in joining order.

The number is editable, because the numbers in the ledger you already keep are
the ones that matter and the app should match them rather than insist on its
own. It is unique per user, enforced by a partial index: two members sharing a
number makes every paper receipt carrying it ambiguous, and that surfaces only
after money is in the wrong column. New members without a typed number get one
past the highest issued - not count+1, which would re-issue a number after a
deletion and collide with the receipt still carrying it.

Introduced-by is a real link to another member rather than a name in a box, so
the member page can show both who introduced them and whom they introduced.

Opening a member now shows their position: which chits they are in, what was
raised against them, what they have paid, what they owe, how many instalments
are overdue, dividends credited, which chits they have won and whether the prize
was actually paid out - plus their securities, guarantors and nominees. Every
figure comes from recorded rows, so it matches the passbook in the member's
hand.

CSV import gains a Download example CSV button. The sample is generated FROM the
column list the parser reads, and a test asserts every column in the sample maps
back to a field - otherwise the two drift, someone fills in a column the
importer ignores, and the data silently does not arrive. The parser handles
quoted fields with commas, accepts the header spellings real spreadsheets use,
reports bad rows individually instead of failing the file, and resolves
Introduced By after every row exists so a file can reference a member it creates
further down.

A row whose member number already belongs to someone is skipped and reported,
not treated as an error, so last month's sheet can be re-imported after a few
names are added to it. Skipping is by NUMBER only - skipping by name would
silently drop a genuinely new member who happens to share a name with someone
already on the register.

Introduced By accepts a member number or an existing member's name. The number
wins when a value could be read either way. A name shared by two members is
left unlinked and reported rather than guessed at: picking the first match would
attach the introduction to the wrong person and nobody would ever notice.

The members page gains sorting (name, member number, recently added) and filters
(active, inactive, portal on, no phone); search now covers PAN as well, since a
PAN is often the only thing written on the document someone is holding when they
ring up. The header shows the number the next member will be given.

PAN now warns on a duplicate the way phone already did, naming which field
matched. A PAN is issued once per person, so a second member carrying one is
almost always the same human typed in again.

Adding members to a group gains search and sorting, and a CSV import: anyone
already on the register is matched and seated, anyone new is created first and
then seated, and the group's seat count is respected rather than overfilled.
Matching prefers the member number and refuses to guess between two members of
the same name - seating the wrong person means billing them for that chit.

Inside a chit group: member names link to the member page, and the member
number is shown beside the name.

Collections no longer arrive with everyone pre-ticked. Defaulting to all-unpaid
assumed a month settles at once; in practice collections arrive a few at a time,
so every use began by unticking twenty people to reach the three who paid - and
a stray click posted payments for the whole group. Tick who paid; Select all is
still one press away.

The Collections tab now counts what is PENDING rather than what has been
collected. A count of collections made only rises and says nothing about whether
there is work to do; pending reaches zero. An instalment counts only once its
month has actually been auctioned.

Adds migration v119.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
