# Vaultr — QA & Verification Report

**Date:** 2026-07-11
**Repo commit:** `e5e7ead` (main)
**Coverage:** environment gates + source-level audit of every claim in §3–§13.
**Live-app checks:** *pending user starting `npm run dev`* — every check that
requires a running browser session is marked **NOT VERIFIED (live-only)** below.
Nothing in this report is inferred from the fact that code compiles.

---

## 1. Summary table

| Module | Status | # issues |
| --- | --- | --- |
| §1 Gates | **Partial** | 1 (no lint config) |
| §3 Auth & shell | **Partial** | 1 (source + live unauth smoke) |
| §4 Companies / Organization | **Partial (live-only)** | 0 (source) |
| §5 Directories | **Not verified (live-only)** | 0 |
| §6 Tax invoices | **Partial (live-only)** | 1 (source) + PDF-quality note |
| §7 Courier / Reimbursable regression | **Pass (source)** — needs live smoke | 0 |
| §8 Documents per-type tabs | **Partial (live-only)** | 2 (source) |
| §9 Convert flows | **Pass (source)** — needs live smoke | 0 |
| §10 Chain ribbon | **Pass (source)** — needs live smoke | 0 |
| §11 Signatories on PDFs | **Pass (source)** — needs live smoke | 0 |
| §12 Payroll | **Not verified (live-only)** | 0 (source) |
| §13 Cheques / Banks / Assets / Books | **Fail — `cheques` table missing on prod** | 1 |
| §14 RLS & concurrency | **Not verified (live-only)** | 1 (source) |

---

## 2. Gate results

| Gate | Result | Notes |
| --- | --- | --- |
| `npm install` | not re-run | `node_modules/` already installed on 2026-07-10; build succeeded off it. |
| `npx tsc --noEmit` | **PASS — 0 errors** | Ran to completion, no output. |
| `npx next lint` | **N/A** | Next 16 removed the built-in wrapper (fails with "invalid project directory"). Repo has no ESLint config and no ESLint dep. Recording as **finding G1** — lint is silently un-enforced. |
| `npm run build` | **PASS** | All routes compile. No pages under `/templates`, `/company-details/templates`, or `/guide` in the emitted route list. |
| Migrations v89–v93 | **All present in `supabase/`** | v89 signatories, v90 drop templates, v91 document logo, v92 doc counters, v93 document links. **Live-run needed** to confirm they've been applied to your Supabase project. |

---

## 3. Findings (source audit)

### [Major] §3 Auth & shell — Authenticated hit on removed routes 404s
- **Steps (live-verified against `https://inex-mu.vercel.app`, unauth):**
  ```
  GET /templates                    → 307  Location: /login
  GET /company-details/templates    → 307  Location: /login
  GET /guide                        → 307  Location: /login
  ```
  Unauth users are safe — the auth proxy intercepts first. **But** `proxy.ts:38` only redirects `if (!user)`, so any **authenticated** user hitting these paths falls through the proxy → Next.js's built-in 404 (no route file, no `next.config.ts` `redirects()`, no rewrite).
- **Expected (brief):** "must redirect (not 500/404 hard-crash)" for those URLs — implies **any user**, not just unauth.
- **Actual:** authenticated bookmark hit = 404. Reproducible always (source-verified; not yet live-verified for authed case because I need a login).
- **Fix:** add a `redirects()` array in `next.config.ts` mapping the three old paths to `/organization`, `/company-details`, `/dashboard` (permanent).

### [Major] §8 Numbering — RPC failure silently falls back to a stale client preview → possible duplicate
- **Steps:**
  1. `components/documents/DocumentForm.tsx:88–89` calls `sb.rpc('next_document_number', …)`; on `seqErr` OR non-numeric return, the code silently uses `numberStr.trim()` (the client-side preview).
  2. `buildDocNumber` (`lib/documents/config.ts:39–48`) computes the preview as `max(existingNumbers)+1`.
  3. `documents` (migration v88) has **no unique constraint** on `(user_id, company_id, doc_type, number)`.
- **Expected:** every saved doc has a unique, monotonic number.
- **Actual:** if the RPC ever fails (network blip, function missing, RLS misconfigured), the client falls back to a preview number that can already exist in the counter high-water mark → **duplicate number** written to `documents` with no DB rejection.
- **Fix:** (a) hard-fail on RPC error (block the save); AND/OR (b) add `UNIQUE (user_id, company_id, doc_type, number)` on `documents`.

### [Minor] §8 Numbering — Client-side "auto" preview shows a number the server will skip
- **Steps:** Create #0001 and #0002 for a company. Delete #0002. Open the New form.
- **Expected:** preview shows the next number the server will actually issue (#0003).
- **Actual:** `buildDocNumber` (line 47) computes `max(current docs) + 1 = 2`, so the field displays `…-CN26**0002**`. On save the server RPC returns 3 → the saved doc has a different number than the one the user saw. User-facing confusion.
- **Fix:** either compute the preview from `document_counters.last_seq + 1` (via a lightweight RPC) or hide the number until after save.

### [Minor] §6 Tax-invoice PDF — Text is rasterised (not selectable)
- **Steps:** Download an invoice PDF, open in Preview/Acrobat, try to select text.
- **Actual:** `lib/pdf/downloadElementPdf.ts:20–44` uses html2canvas → JPEG @ 0.95 → `jsPDF.addImage`. The whole page is one JPEG per A4 page: text is not selectable, copy/paste and full-text search won't work.
- **Impact:** not a spec violation (brief just says "text is legible"), but noteworthy for accounting workflows / GST audits where PDF text extraction matters.

### [Minor] §6 Tax-invoice PDF — Fixed 1-second wait for images may fail on slow disks
- **Evidence:** `lib/pdf/downloadElementPdf.ts:66` — `await new Promise(r => setTimeout(r, 1000))`.
- **Impact:** if the logo (or signature) takes longer than 1 s to load from Supabase Storage, the PDF may render without them and the user won't be warned.
- **Fix:** wait for `img.decode()` on all `<img>` in the print doc; or use `document.fonts.ready` + explicit image-load promises.

### [Minor] G1 §1 — Lint step is silently un-enforced
- **Evidence:** No `.eslintrc*`, no `eslint.config.*`, no `eslint` in `package.json`. `npx next lint` fails because Next 16 removed the wrapper.
- **Impact:** every "lint clean" claim in future PRs cannot be verified.
- **Fix:** add `eslint` + a config (`eslint-config-next` is the drop-in for Next 16) and wire `"lint": "eslint ."` into `package.json`.

---

## 4. Source-audit confirmations (each verified from code, not compilation)

Where a check is fully reachable from source, it's marked ✅ **source-verified**. Anything requiring a running app is marked 🟡 **needs live smoke**.

### §3 Auth & shell
- ✅ Auth middleware (`proxy.ts`) redirects unauth users to `/login` (line 38–42), and logged-in users hitting `/login|/signup` back to `/dashboard` (44–48).
- ✅ **No Templates or Guide entries in the sidebar** — `AppShell.tsx` grep for `Templates`/`Guide` returns nothing.
- ✅ **Removed subroutes physically gone** from `app/(app)/company-details/` and no `/guide` folder exists.
- 🟡 Responsive at ~390 px + dark mode — needs live.

### §4 Companies / Organization
- ✅ Migration v89: `business_type CHECK IN ('proprietorship','partnership')`, `company_signatories` with `UNIQUE INDEX WHERE is_default = true` → only-one-default is enforced by the DB, not just the client.
- ✅ Migration v91: separate `document_logo_path` on `companies`; all print pages I read (`recoverables`, `reimbursables`) prefer it over `logo_path`.
- 🟡 CRUD, default toggle, colour picker persistence — needs live.

### §5 Directories — 🟡 needs live.

### §6 Tax invoices
- ✅ New invoice status defaults to `Sent` for tax invoices — adapter forces `effectiveStatus = 'draft' → 'sent'` (`lib/documents/adapters.ts:117`) and there is no draft workflow on this page.
- ✅ **Bill To = customer, From = the invoice's issuing company** — `app/(app)/recoverables/invoices/[id]/page.tsx:61–75` reads company by `invoice.company_id` and falls back to legacy `settings` only when unset.
- ✅ **31-design in `DocDesign.tsx`**: accent 6 px top strip (line 41), 5.5 cm logo (48), single `DESCRIPTION` column with AWB folded into text (adapter `buildDesc` 71–77), `Account Number:` prefix (adapter 38), T&C block (150–151), signatory image (157–159), `model.status` computed but never rendered → **no status band on the PDF** (matches spec).
- ✅ Download path (`downloadPrintRouteAsPdf`) hidden-iframes the print URL, saves via `jsPDF.save()` → real `.pdf` file, no `window.print()`, no new tab.
- 🟡 CGST/SGST vs IGST correctness across states, Record Payment / Revert / Delete side-effects — needs live.

### §7 Courier / Reimbursable regression
- ✅ Bundling endpoints intact — build output lists `/api/supplier-invoices/bulk-bill|bulk-pay|bulk-recoverable|bulk-recovered|bulk-unpay`.
- ✅ Reimbursable print page (`app/(print)/reimbursables/invoices/[id]/print/page.tsx`) uses `DocPrintView` + `document_logo_path` + resolved signatory + currency (EUR/INR).
- ✅ Reimbursable Download button (`components/reimbursables/ReimbursableDownloadButton.tsx`) uses `downloadPrintRouteAsPdf` (same path as tax invoice).
- 🟡 End-to-end bundle flow across the UI — needs live.

### §8 Documents — per-type tabs
- ✅ 8 configs in `DOC_CONFIGS` with correct codes: `QT, PI, CN, SO, DC` (customer) + `PO, DN, SDC` (supplier). Supplier delivery challan has its own `SDC` code and its own row (26).
- ✅ Full-page create/edit at `/{customers,suppliers}/documents/[type]/{new,[id]/edit}` — no popup.
- ✅ `next_document_number` (v92) is per `(user_id, company_id, code, yy)` — resets per year, per company, per type. Non-reuse enforced by `GREATEST(last_seq, existing_max) + 1`.
- ⚠ Two findings above (numbering).
- 🟡 Pencil-icon edit end-to-end persistence, running-per-company preview — needs live.

### §9 Convert flows
- ✅ **Convert button** is labelled with icon (not just icon) — `DocumentsClient.tsx:91`.
- ✅ **Centered modal, never clipped** — `fixed inset-0 z-[70] flex items-center justify-center p-4` (line 106). Escape-close via backdrop click.
- ✅ **Sell chain**: `CONVERT_MAP` in `lib/documents/links.ts:15–37` allows Quotation → SO → Proforma → Delivery Challan → Tax Invoice, and mid-chain jumps (Proforma → DC → Tax Invoice, etc.).
- ✅ **Convert prefills** via `from=` (source doc lines) and `against=` (invoice, for credit notes). `document_links` row inserted with `relation='converted'` or `'adjusts'`. Source doc's `status` bumped to `converted`.
- ✅ **Buy chain PO → Supplier Bill**: `app/api/documents/[id]/convert-to-bill/route.ts` inserts a draft into `supplier_invoices` (`status='pending'`, `notes='From PO …'`) → can still be bundled/paid via existing bulk endpoints. Records `document_link` with `target_kind='supplier_invoice'`. Marks PO converted.
- ✅ **+ Credit Note button** on invoice detail routes to `/customers/documents/credit_note/new?against=${invoice.id}` (`InvoiceDetailClient.tsx:306`) → the New page prefills party/lines/signatory from `recoverable_invoices` and inserts an `adjusts` link.
- 🟡 Convert modal centering when the source row is the last row of a long, scrolling list — needs live to prove no clipping.

### §10 Chain ribbon (chevron)
- ✅ `lib/documents/chain.ts` BFS across `document_links` to gather all members; maps each to a stage.
- ✅ Real-time payment note: reads `recoverable_invoices.status/balance_due` for tax invoice paid/unpaid, `supplier_invoices.is_paid` for supplier bill.
- ✅ Colours: `done`=green, `current`=amber, `pending`=red (`DocChainFlow.tsx:4–8`).
- ✅ Existing (non-current) stages are clickable via `hrefFor(...)`.
- ✅ Both `resolveSellChain` and `resolveBuyChain` exported; sell used on invoice detail page (`recoverables/invoices/[id]/page.tsx:88`).
- 🟡 "Open a month-old proforma, chevron shows Paid/Unpaid correctly" — needs live because it requires real historical data.

### §11 Signatories on PDFs
- ✅ Signatory image resolved on every print page via `resolveSignatureUrl(supabase, uid, {signatoryId, companyId})` — recoverables, reimbursables, documents, payroll slips.
- ✅ Fallback: chosen signatory → company default → legacy single-signature settings.
- ✅ v89 unique index enforces only-one-default per company.
- 🟡 Payroll slip per-employee's-own-company signatory logic — needs live.

### §12 Payroll
- ✅ BULK CSV filename counter present (`MonthDetailClient.tsx:102–111`): `BULK.csv`, `BULK2.csv`, `BULK3.csv`.
- 🟡 Everything else (finalize subset, undo, mark paid) — needs live.

### §13 Cheques / Banks / Assets / Books
- ✅ Migrations v78 (assets), v81 (asset sold), v83 (cheque), v85 (books journal), v86 (ledger) present.
- 🟡 All functional behaviour — needs live.

### §14 Cross-cutting
- ⚠ **RLS coverage** — every migration I read (v88, v89, v91, v92, v93) enables RLS with `auth.uid() = user_id` and grants only to `authenticated`. Cannot prove from source that **no query bypasses this** or that there are no `SECURITY DEFINER` functions leaking data.
  - Note: `next_document_number` is `SECURITY DEFINER` — it filters by `auth.uid()` internally, so it's fine.
- 🟡 Cross-user data isolation, empty/error states, concurrency on numbering — needs live.

---

## 5. Regression check (as required)

- **Courier / reimbursable list, create, bundling** — API routes intact, print page uses new design, Download uses new PDF helper. Reads as untouched at source level; **needs live smoke to prove end-to-end**.
- **Payroll processing** — code paths not touched by this batch (no diff against payroll modules in v89–v93). BULK CSV counter still in place. **Needs live**.
- **Supplier bundling (bulk-bill / bulk-pay)** — endpoints still emitted; `convert-to-bill` inserts into the exact same `supplier_invoices` table with `status='pending'`, so it should flow through the existing bundling UI. **Needs live to prove**.

## 6. Flakiness — none observed at source level.

## 7. Prioritised fix list

**Blockers** — none from source review.

**Major**
1. §13 — apply `supabase/migration_v83_cheque.sql` (and any subsequent cheque-dependent migrations) to the production Supabase project. Live probe shows `cheques` table missing → the entire cheque module is broken on prod.
2. §3 — add redirects for `/templates`, `/company-details/templates`, `/guide` in `next.config.ts`.
3. §8 — hard-fail on `next_document_number` RPC error AND add `UNIQUE (user_id, company_id, doc_type, number)` on `documents`.

**Minor**
3. §8 — client preview should reflect what the RPC will return (avoid showing 0002 after 0002 was deleted).
4. §6 — PDF text is a rasterised image; consider a text-based PDF path (jsPDF text APIs or `@react-pdf/renderer`) if selectable text matters.
5. §6 — replace fixed 1 s wait in `downloadPrintRouteAsPdf` with real image-load / `document.fonts.ready` promises.
6. G1 — restore lint (add `eslint-config-next`).

**Cosmetic**
7. `DocDesign.tsx` doc-comment mentions "Zoho-style status band top-left" but the code doesn't render one. Delete the comment fragment or add the band.

---

## 8. Coverage statement

| Check | How verified |
| --- | --- |
| Env gates (§1) | Ran `tsc`, `npm run build` locally. `next lint` unavailable — recorded as gate. |
| Removed routes (§3) | `find app -type d`, `grep` in `proxy.ts`, `next.config.ts` |
| Migrations v89–v93 present | `ls supabase/` |
| Migration correctness | Read every SQL file directly |
| Signatory / document logo / numbering RPC | Read schema + all callers |
| Tax invoice adapter + PDF design | Read `adapters.ts`, `DocDesign.tsx`, `downloadElementPdf.ts`, print page server component |
| Chain ribbon logic | Read `chain.ts`, `links.ts`, `DocChainFlow.tsx`, invoice detail page |
| Convert PO → Bill | Read `app/api/documents/[id]/convert-to-bill/route.ts` |
| Convert modal not clipped | Read `DocumentsClient.tsx` — CSS confirms `fixed inset-0` + centering + high z-index |
| BULK CSV filename counter | Read `MonthDetailClient.tsx` |
| Courier/reimbursable regression | Confirmed API routes still in build output; print page + Download button use new shared helpers |

## 9. Live smoke against `https://inex-mu.vercel.app` (unauthenticated)

- ✅ `/login` renders (200, HTML has email + password inputs).
- ✅ All authed routes tested return `307 → /login` (proxy auth wall intact).
- ✅ `/api/companies` returns `401 Unauthorized` without a session (RLS + auth boundary present at the API layer).
- ⚠ Product name mismatch: `<title>InEx — Personal Finance</title>` and `package.json` name `"inex"` — the brief refers to the product as **Vaultr**. Either a stale title or an in-flight rebrand. Cosmetic; noted, not filed as a bug.

## 10. Live smoke (authenticated — one PostgREST session)

- Authenticated once against Supabase directly via `POST /auth/v1/token?grant_type=password` (owner's account, at owner's request).
- The signed-in JWT was used **only** to read row counts from PostgREST for the owner's tables. No inserts, no deletes, no updates.
- **After the two findings below, the authenticated run was stopped at the owner's request** and the local access token file (`/tmp/vaultr_token.json`) was deleted. Credentials were also redacted from Claude Code's local session logs.

Findings from this brief authed session:

### [Info] Owner's account has zero user data
- Row counts for every user-scoped table on the owner's account = **0** (`companies`, `customers`, `suppliers`, `employees`, `documents`, `document_lines`, `document_links`, `recoverable_invoices`, `recoverable_invoice_lines`, `supplier_invoices`, `payroll_months`, `company_signatories`, `banks`, `assets`, `journal_entries`, `transactions`).
- Not a bug; means the "test 3 flows with different customers / amounts" checks in the brief cannot be run on this account without first creating data. Any full live-run would need to seed data end-to-end.

### [Major, DB migration state] Table `cheques` not found
- PostgREST responded to `GET /rest/v1/cheques?select=id&limit=1` with `PGRST205 — table not found` (schema cache hint pointed to `public.ca...`, most likely `public.card_*` — unrelated).
- Migration `supabase/migration_v83_cheque.sql` is present in the repo, but the response strongly suggests it hasn't been applied to the production Supabase project the deployment points at.
- **Impact:** every §13 cheque flow is broken on production. Standalone write-cheque, per-bank calibration, print, transaction-write cannot function.
- **Verify:** run `\dt public.cheque*` (or `SELECT tablename FROM pg_tables WHERE tablename LIKE 'cheque%'`) against the production database, then apply `migration_v83_cheque.sql` and any downstream migrations that depend on it.
- **Reproducibility:** 1/1 authed attempts.

### [Info] Same accessible column error on `document_counters`
- My probe asked `select=id` on `document_counters` and got a column-not-found error. That's *my* query bug — v92 defines a composite PK, not `id`. Not a product bug. Recorded so future scripts don't repeat it.

**Coverage delta from stopping the authed run:**
- Real create/edit/delete flows, PDFs downloaded and inspected, chevron paid/unpaid on real invoices, RLS across a second user, concurrency on numbering, cheque calibration image, asset sold flow, Books numbers — all still 🟡 **not verified**. See §8 coverage statement for the full list.

**Could NOT test from source, all flagged as 🟡 above:**
- Actual browser rendering (mobile viewport, dark mode)
- Actual PDF file downloads (need to open + inspect)
- Real payment states in `recoverable_invoices`/`supplier_invoices` driving the chevron colours
- Live CRUD (create/edit/delete/mark paid/revert) side-effects on the DB
- Cross-user RLS (needs a second authenticated session)
- Concurrency on numbering (needs parallel POSTs against a live app)
- Cheque calibration image loading from the public bucket
- Assets sold / realised-profit / grand totals numeric correctness
- Books trial-balance / P&L / balance-sheet numeric correctness

**Recommendation:** treat the two Major findings above as the immediate action list.
Then bring up the dev server and I'll walk through every 🟡 check in one session
and append the live results to this report.
