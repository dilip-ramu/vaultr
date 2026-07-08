# Vaultr — Full App Audit

_Generated from a static + test pass over the codebase. Scope: design, functionality, ease of use, scalability, security, and code health/redundancy._

## Snapshot

| Metric | Value |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ clean |
| Unit tests (`vitest`) | ✅ 182 passing (15 files) |
| App code | ~55,000 LOC · 131 components · 79 pages · 74 API routes · 64 lib files |
| DB | 47 tables · **82 manual SQL migrations** · RLS on **all** tables ✅ |
| Dependencies | 15 runtime · 11 dev (lean) |

**Overall:** healthy and genuinely feature-rich, with a solid security baseline. The main risks are **accumulated structural debt** (overlapping "invoice" domains, 82 hand-written migrations, several 1,000-line components), **no pagination on large lists**, and **no automated tests above the pure-calculation layer**. Nothing is on fire; a few things are worth fixing before/if this scales to more data or more users.

---

## 1. What's working well

- **Security fundamentals are strong.** Row-Level Security is enabled with per-user `auth.uid() = user_id` policies on every one of the 47 tables. The service-role key is confined to server-only code (`lib/supabase/admin.ts`, the two crons). Sensitive data rule (no CVV storage) is respected.
- **Business logic is tested.** The parts most likely to be wrong — reimbursable/GST math, cards/statements, forecast, commission, reconciliation, TDS words — have 182 unit tests and they pass.
- **Consistent design system.** CSS-variable tokens (light/dark), Manrope, one accent model. Recent nav consolidation (hubs + tabs, minimal sidebar) is coherent.
- **Type-safe end to end.** `tsc` is clean; only ~31 explicit `any`s in 55k LOC.
- **Lean dependency surface.** Few third-party runtime deps — less supply-chain and upgrade risk.

---

## 2. Design choices

**Good**
- Token-driven theming makes global restyles cheap (as the recent redesign showed).
- Server components fetch data; client components handle interaction — mostly the right split.

**Worth reconsidering**
- **Manrope is loaded via a runtime `<link>`**, not `next/font`. This was a deliberate workaround for a build-time Google Fonts fetch, but it costs a render-blocking request + a flash of unstyled text. Consider self-hosting the font files and loading via `next/font/local` for no external request and no FOUT.
- **Very large client components.** `SupplierInvoicesClient` (1,114), `EmailDocumentsClient` (1,051), `ReimbursableInvoiceClient` (1,011), `CreateInvoiceClient` (830), `MonthDetailClient` (771). These mix data-loading, business rules, and a lot of JSX; they're hard to test and to change safely. Extracting sub-components/hooks would help.
- **Heavy inline `style={{…}}`** alongside Tailwind. It's tokenized so it's not wrong, but it's verbose and inconsistent with the utility-class approach in other files.

---

## 3. Functionality

**The biggest structural issue: overlapping "invoice" domains.** There are at least four parallel money-document systems:

| Table / system | Purpose |
|---|---|
| `bills` | Payables you owe / receivables you're owed (manual) |
| `supplier_invoices` | Invoices fetched from email + recurring auto-pay |
| `recoverable_invoices` | Courier tax invoices **and** reimbursement invoices (via `invoice_type`) |
| `contrast_invoices` | Legacy reimbursement table; the `/api/contrast/*` routes + "contrast" vocabulary still power reimbursement invoices |

This works, but it's a lot of overlapping concepts for one app, and the **`contrast` legacy naming** (tables, APIs, columns like `contrast_invoice_id`) leaks a former customer's name throughout the codebase. It's the single biggest source of "what is this / is this redundant?" friction. A consolidation/renaming pass (even just `contrast` → `reimbursement`) would materially reduce confusion.

**Recurrence is modeled two different ways.** Supplier invoices auto-process via the daily cron (create transaction + spawn next). Bills only spawn the next occurrence when you manually mark one paid (just added). Two mental models for "recurring." Fine for now, but worth unifying if recurring becomes a headline feature.

**Correctness:** the unit tests cover the risky math and pass. No functional bugs surfaced in static review beyond the ones already fixed this session (employees filter, reconcile ordering, paid-courier bundling, recurring-bill rollover).

---

## 4. Ease of use

- Navigation is now a clean minimal sidebar + per-hub tabs; the recent de-duplication removed the doubled sub-menus.
- The stepped add/edit transaction flow and the inline account reconcile are genuine UX improvements.
- **Residual URL cruft:** 14 routes are pure `redirect()` shims (`/subscriptions`, `/bills`… wait, `/bills` now renders; `/settings`, `/reconcile`, `/currencies`, `/categories`, `/account-types`, `/downloads`, `/payroll`, `/payroll/staff`, `/suppliers/{payments,recoverables,billed}`, `/setup`, `/setup/reconcile`). Keeping a few for old bookmarks is fine; keeping all of them forever is quiet debt.

---

## 5. Scalability & performance

This is where I'd focus first if usage grows:

- **No pagination anywhere.** The transactions page loads `.limit(1000)`; invoice lists cap at 500/60. These are hard ceilings, not pages — a power user with >1,000 transactions silently loses history, and rendering ~1,000 rows client-side gets sluggish. Add cursor/keyset pagination (or virtualized lists) for transactions and invoices.
- **132 `select('*')` calls.** Many pull every column (including large text/JSON) when the UI needs a handful. This inflates payloads and coupling. Select explicit columns on the hot paths (transactions, invoices, inbox).
- **45 client components fetch their own data** with the browser Supabase client (e.g., `TransactionForm` re-fetches accounts/categories/payees/companies every time it opens). No caching/React-Query layer, so the same reference data is fetched repeatedly. A lightweight query cache would cut redundant round-trips.
- **82 hand-written migrations** with no consolidated schema file. Onboarding a new environment means replaying 82 files in order; there's no single source of truth to diff against. Consider a squashed baseline schema + migrations-from-here, or adopt Supabase's migration tooling.

None of these bite at single-user / low-data scale; all of them bite as data and users grow.

---

## 6. Security

Strong baseline (RLS everywhere, service role server-only). Two things to tighten:

- **⚠️ Cron endpoints fail *open* if `CRON_SECRET` is unset.** The guard is `if (cronSecret && authHeader !== …) return 401` — so when the env var is missing, the check is skipped and `/api/cron/process-recurring` (which **creates transactions and auto-pays**) and `/api/cron/fetch-bank-alerts` are publicly callable. Make it fail *closed*: reject when the secret is absent, and confirm `CRON_SECRET` is set in the deployment. (Especially relevant now on Vercel Hobby.)
- **No `middleware.ts`.** `proxy.ts` implements Supabase session-cookie refresh but isn't wired as edge middleware, so tokens aren't refreshed on navigation — users can get logged out abruptly when the access token expires. Either wire `proxy` into a `middleware.ts` or delete `proxy.ts` if it's intentionally unused.

---

## 7. Redundant / unnecessary / dead code

**Unreferenced components (safe to delete after a quick confirm):**
- `components/customers/reimbursables/AddReimbursableButton.tsx`
- `components/customers/reimbursables/ReimbursablesNewInvoiceLink.tsx`
- `components/setup/SetupTabs.tsx` (superseded by HubTabs)
- `components/transactions/QuickAddSheet.tsx`
- `components/bills/BillNotificationBanner.tsx`
- `components/recoverables/dashboard/SupplierBalances.tsx`
- `components/recoverables/supplier/SupplierLedgerClient.tsx`

**Other:**
- `proxy.ts` — dead unless wired (see Security).
- **4 copies of `calcDueDate`** across the code — extract to `lib/`.
- 6 `TODO/FIXME` markers, 1 stray `console.log`.
- The 14 redirect-only routes (keep a curated few, drop the internal-only ones).

---

## 8. Prioritized recommendations

**P0 — do soon**
1. Make cron auth **fail closed** and set `CRON_SECRET` in prod. (Small change, real exposure.)
2. Decide on `middleware.ts` (wire `proxy.ts`) so sessions refresh; otherwise expect random logouts.

**P1 — before this scales**
3. Add pagination to transactions + invoice lists; stop relying on `.limit(1000)`.
4. Trim `select('*')` on the hot paths to explicit columns.
5. Delete the dead components + `proxy.ts` (if unused) + de-dupe `calcDueDate`.

**P2 — pay down structural debt**
6. Rename the `contrast_*` domain to `reimbursement_*` (tables/APIs/columns) — biggest clarity win.
7. Consolidate the overlapping invoice systems, or at least document the intended boundary between bills / supplier_invoices / recoverable_invoices.
8. Squash the 82 migrations into a baseline schema; add a lightweight client-side query cache; break up the 1,000-line components.

---

### Caveats on this audit
This is a static + unit-test review. I did **not** run the production build to completion, click through the live UI, or load-test against real data volumes — so runtime-only issues (hydration mismatches, slow queries under load, third-party email/bank-fetch failures) aren't covered here. The pagination and `select('*')` concerns are inferred from the code, not measured. If you want, I can turn any P0/P1 item into an actual change.
