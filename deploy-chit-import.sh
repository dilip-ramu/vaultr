#!/usr/bin/env bash
#
# Chit member import: Excel or CSV, with the column matching on screen
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-chit-import.sh
#
# NO MIGRATION.

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
git add \
  lib/chit/importSheet.ts \
  lib/__tests__/chit-import-sheet.test.ts \
  components/chit/SheetImport.tsx \
  components/chit/ChitMembersClient.tsx \
  components/chit/ChitGroupDetail.tsx
git commit -m "Chit import: Excel too, and the column matching happens on screen

The old importer read a CSV, matched the header row against a list of
aliases in secret, and imported. When the match failed - a column called
'Mobile No.', a title row above the headers, a sheet exported from somebody
else's software - it either dropped the column without saying so or refused
the whole file with 'no Name column'. Nothing on screen said which columns
it had understood, so the only way to find out was to import and look at
the damage.

Now it reads .xlsx, .xls and .csv through one path, and the matching is a
step you can see: every field with the column it was matched to, a sample
of what is actually in that column, and a dropdown to change it. Then a
check step showing the rows as they will be imported, with the ones that
will be skipped marked. Back works at every step and nothing is written
until the last one.

Three things it gets right that the old one did not:

- It opens on the sheet that LOOKS like a member list, not the first sheet
  with anything in it. A workbook that leads with a cover sheet used to
  open on the cover and offer no columns at all.
- It finds the header row rather than assuming row 1, because sheets made
  by people start with a title and a blank line.
- It reads the cell's VALUE, not the cell's displayed text. Asking the
  spreadsheet how it would show a 14-digit bank account number gives
  '5.01001E+13', and that is what used to get imported.

The matching never gives one file column to two fields, and exact header
names are matched everywhere before any loose matching - otherwise a column
called 'Account Name' gets claimed by Name and the member register fills up
with bank account holders.

What happens to the rows is unchanged and still lives in each caller:
skipping members already on file, linking Introduced By in a second pass,
and for a group, seating without overfilling.

Both the member register and the import-into-a-chit screen use it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
