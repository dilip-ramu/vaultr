#!/usr/bin/env bash
#
# Company billing accounts — documents print YOUR OWN bank accounts
#
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-bank-accounts.sh
#
# NEEDS MIGRATION v118. There is no v117 to run — it was superseded before it
# was ever applied and has been moved to _to_delete/.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(print)/documents/[id]/print/page.tsx"
  "app/(print)/recoverables/invoices/[id]/print/page.tsx"
  "app/(print)/reimbursables/invoices/[id]/print/page.tsx"
  app/api/companies/billing-accounts
  app/api/recoverables/invoices/route.ts
  components/company-details/BankAccountsPanel.tsx
  components/company-details/CompanyForm.tsx
  components/documents/DocumentForm.tsx
  components/recoverables/invoices/CreateInvoiceClient.tsx
  components/shared/BankAccountPicker.tsx
  lib/companies/bankAccounts.ts
  lib/__tests__/company-bank-accounts.test.ts
  lib/__tests__/invoice-bank-details.test.ts
  supabase/migration_v118_company_billing_accounts.sql
)

hr "0. Remove the scratch folder left by the assistant"
rm -rf _to_delete _gitlock_trash
echo "   done"

hr "1. Clear stale build output"; rm -rf .next; echo "   done"
hr "2. Typecheck"; npx tsc --noEmit || die "typecheck failed"; echo "   clean"
hr "3. Tests";     npm test        || die "tests failed";     echo "   passed"
hr "4. Production build"; npm run build || die "build failed"; echo "   ok"

hr "5. MIGRATION — apply before continuing"
cat <<'MSG'
   Supabase SQL editor. Paste and run:
     supabase/migration_v118_company_billing_accounts.sql

   It is safe to run whether or not anything earlier was applied. Then check
   which account each company will bill from:

     select c.name                as company,
            a.name                as bank_account,
            a.account_number,
            a.ifsc_code
       from companies c
       left join accounts a on a.id = c.default_bank_account_id
      order by c.name;

   A company showing NULL has no account assigned yet — its documents will print
   no bank block until you assign one. Do that on the Accounts page (set the
   account's company) or in Company details -> Bank accounts -> Add account.
MSG
read -r -p "   Migration applied and checked? [yes/no] " ok
[ "$ok" = "yes" ] || die "apply the migration first"

hr "6. Review"; git status --short
echo
read -r -p "   Look right? [yes/no] " ok2
[ "$ok2" = "yes" ] || die "stopping at your request"

hr "7. Commit and push"
git add -A
git commit -m "Documents print your own bank accounts, chosen per document

Bank details were four columns on companies - one account per company, typed
again in a place separate from the accounts this app already tracks. And the tax
invoice path merged the company over a legacy global settings row, so a company
with no bank details of its own printed a DIFFERENT entity's account number,
silently, on every invoice.

Accounts already exist, already hold account_number, ifsc_code, branch and
swift_code, and since v100 already carry company_id. So they are the source.
Assign an account to a company on the Accounts page and it appears on that
company; Company details -> Bank accounts -> Add account picks from the accounts
that exist rather than asking for the number a second time. There is one copy of
an account number, and every document that prints it follows.

companies.default_bank_account_id says which one a document uses when it does
not name one; documents and recoverable_invoices carry bank_account_id for when
it does. All three print paths - issued documents, tax invoices and reimbursable
invoices - resolve through one module: the account the document names, else the
company default, else nothing. Never another company's, not even via a stale
default. A document keeps the account it was issued with, so reprinting an old
invoice reproduces it.

Adds migration v118, which repoints the columns at accounts, clears values that
pointed at the superseded table, backfills each company's default from the
accounts already tagged to it, and drops that table only if it is empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SMv6Ci4NuEjkgHw2W7ST2B" || die "commit failed"
git push origin main
