#!/usr/bin/env bash
#
# Inex Investment Lab — research cost & efficiency pass
#
# Run from the repo root in the macOS Terminal:
#   cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"
#   bash deploy-inex-efficiency.sh
#
# NO MIGRATION IS NEEDED. The ₹10,00,000 Lab is not touched: no reset, no
# deleted decisions or trades, no changed benchmark, no changed risk limits.
# Every gate must pass before anything is committed or pushed.
#
# The commit stages named files only, so nothing unexpected (including this
# script) can slip into it.

set -euo pipefail
cd "/Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr"

hr()  { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
die() { printf '\n\033[31mSTOP: %s\033[0m\n' "$1"; exit 1; }

FILES=(
  "app/(app)/suppliers/invoices/page.tsx"
  components/suppliers/invoices/SupplierInvoicesClient.tsx
  components/suppliers/invoices/SupplierInvoiceForm.tsx
  app/api/investments/analyze/route.ts
  app/api/investments/discover/route.ts
  app/api/investments/lab/preflight/route.ts
  components/investments/lab/LabOverviewTab.tsx
  lib/__tests__/helpers/lab-fixture.ts
  lib/__tests__/lab-cost-efficiency.test.ts
  lib/investments/analyzeCore.ts
  lib/investments/analyzeStages.ts
  lib/investments/claude.ts
  lib/investments/models.ts
  lib/investments/types.ts
  lib/investments/lab/config.ts
  lib/investments/lab/corporate-sync.ts
  lib/investments/lab/cycle-state.ts
  lib/investments/lab/cycle.ts
  lib/investments/lab/overview.ts
  lib/investments/lab/types.ts
  lib/investments/providers/fundamentals.ts
  lib/investments/providers/macro.ts
  supabase/READONLY_lab_cost_evidence.sql
)

hr "1. Clear stale build output"
rm -rf .next
echo "   done"

hr "2. Typecheck"
npx tsc --noEmit || die "typecheck failed — do not deploy"
echo "   clean"

hr "3. Tests (real vitest, macOS bindings)"
npm test || die "tests failed — do not deploy"
echo "   all suites passed"

hr "4. Production build"
npm run build || die "next build failed — do not deploy"
echo "   build ok"

hr "5. Review the change"
git diff --stat -- "${FILES[@]}"
git status --short
echo
read -r -p "   Does this look right? [yes/no] " ok
[ "$ok" = "yes" ] || die "stopping at your request"

hr "6. Commit"
git add -- "${FILES[@]}"
git commit -m "Cut research cost ~50% by routing extraction to Haiku and budgeting web searches per task

Every research call went to claude-sonnet-4-5 with six web searches, because the
transport defaulted the model and no caller ever passed one. Search results are
billed as input tokens and re-sent on every internal iteration, so cost grew with
the square of max_uses — one 6-search call carried ~128k input tokens.

Routing now separates extraction from judgement (lib/investments/models.ts).
Fundamentals, corporate actions and the preflight ping run on Haiku, because
those have a right answer to look up. The qualitative analysis, idea generation
and the macro regime stay on Sonnet: that is the reasoning the Lab exists to
test, and nothing here makes it weaker. Search budgets are set per task and the
Lab's max_web_searches_per_analysis becomes a ceiling that can lower a budget but
never raise it.

Unevaluated candidates from a finished cycle are reused within a TTL instead of
paying for a scan that re-surfaces the same names. Each carried name is still
researched and judged from scratch.

Token counts are now read from each API response and folded into the cycle
counters and stage log, with a cost estimated from a published price list. It is
labelled estimated everywhere, and a call that never returned reports unknown
rather than zero. The Lab overview gains a Research cost card saying the same.

No migration. No change to the investment policy, the scoring, or the Lab state.

Also fixes the supplier dropdown on Suppliers > Invoices > Add. That page named
its supplier columns, including default_invoice_category from migration v103. If
that migration had not run, PostgREST rejected the whole query, data came back
null, and the form rendered an empty dropdown that looked exactly like having no
suppliers. It now selects *, logs any query that fails, and says on screen
whether the list is empty or broken." || die "commit failed"
echo "   committed"

hr "7. Push — Vercel deploys main automatically"
git push origin main
echo
echo "   Watch the build at https://vercel.com/dashboard"
