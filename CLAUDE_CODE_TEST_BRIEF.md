# Vaultr — Full QA & Verification Brief (for Claude Code)

You are testing **Vaultr**, a Next.js (App Router) + Supabase + TypeScript finance app
(GST invoicing, courier/reimbursable billing, payroll, cheques, assets, double-entry
"Books", and a Zoho-style document-chain system). Your job: **test every page, feature,
and functionality — multiple times — and produce a written findings report.**

Work methodically. Do not assume something works because it compiles. Prove it.

---

## 0. Ground rules

- **Run every flow at least 3 times**, with different companies / customers / suppliers /
  amounts / currencies each pass. Note any inconsistency between passes (esp. numbering).
- For each check, record: **PASS / FAIL / PARTIAL**, exact steps, expected vs actual,
  severity (Blocker / Major / Minor / Cosmetic), reproducibility (always / intermittent),
  and evidence (console error, network 4xx/5xx, server log, screenshot, DB row).
- Capture **browser console errors**, **failed network requests**, and **Next.js server
  logs** during every flow. A silent 500 or a red console error is a FAIL even if the UI
  "looks fine".
- After changing data, **verify the database** (Supabase) reflects it correctly, and that
  **Row-Level Security** prevents seeing another user's data.
- Do not modify product code to make a test pass. If you must add test scaffolding, keep it
  isolated (e.g. a `/e2e` folder) and say so.

## 1. Environment setup & gates (run first, must all be green)

1. `npm install` (must succeed; note vulnerabilities but don't `audit fix --force`).
2. `npx tsc --noEmit` → **0 errors** required.
3. `npx next lint` → record all errors/warnings.
4. `npm run build` → must complete. Record any build error or failed page.
5. Confirm all Supabase migrations in `supabase/` have been applied **in order** (through
   the latest — includes v89 signatories, v90 drop templates, v91 document logo, v92 doc
   counters, v93 document links). List any that error.
6. Start the app (`npm run dev` or the built server), log in, and confirm the dashboard
   loads with no console errors.

## 2. Automated E2E (build this, then run the suite ≥3× in a row)

Set up **Playwright** against a local instance with a seeded test account. Write E2E specs
covering the flows in §3–§14. Run the full suite **three times consecutively** and report
any flakiness. Where UI automation is impractical, verify via API calls + DB assertions and
say which method you used per check.

---

## 3. Auth, shell & navigation

- Login / logout / session persistence; unauthenticated redirect to `/login`.
- Every sidebar/hub tab routes correctly and renders without error.
- **Removed items must be gone:** no **Templates** tab (Organization or Company details),
  no **Guide** link. `/templates`, `/company-details/templates`, `/guide` must **redirect**
  (not 500/404 hard-crash).
- Responsive: test desktop + a ~390px mobile viewport. Dark mode if present.

## 4. Companies / Organization

- Create, edit, delete a company. Set **default** company (only one default enforced).
- **Business type** toggle Proprietorship / Partnership persists.
- **Authorised signatories**: add multiple, edit name/designation, upload signature image,
  set a default (only one default), delete. Images render.
- **Two logos**: the **app logo** and the separate **document logo** upload/replace/remove
  independently. Directory-card **accent colour** (incl. custom rainbow swatch) persists.
- Confirm the **"Next invoice"** old-format line is **gone** from company cards.
- Company card grid = directory-card design.

## 5. Directories (Customers / Suppliers / Employees)

- Card design + per-item colour picker (incl. custom colour) saves and re-renders.
- Create/edit/delete each entity; validation on required fields.

## 6. Tax invoices (customer)

- Create a typed GST invoice (full-page form): pick customer, company, **signatory**,
  lines (desc/HSN/qty/rate/GST), totals compute correctly (CGST/SGST vs IGST inter-state).
- New invoice status = **Sent** (not Draft). **Mark as Sent** button appears for any Draft.
- **Edit** an invoice (all fields + lines) and save; **Record Payment** → status Paid,
  balance 0, income transaction created; **Revert / Mark as Unpaid**; **Delete**.
- **Bill To** = the customer, **From** = the invoice's issuing company (NOT a fixed legacy
  company). Confirm they differ correctly.
- **Download PDF** saves a real `.pdf` file (no print dialog, no new tab). **Print** page is
  clean (no shadow). The 31-design renders: accent top strip, **5.5 cm logo** (document logo
  if set), single **Description** column (AWB/client folded into description, not separate
  columns), **Terms & Conditions**, bank block labelled **"Account Number: …"**, signatory
  image. **No status band/ribbon on the PDF.**

## 7. Courier / Reimbursable invoices (MUST STILL WORK — regression)

- These are **separate** from tax invoices and from the document chain. Verify the existing
  create/list/bundling flow is **unchanged**: combine multiple supplier invoices and bill
  them together still works end to end.
- Reimbursable invoice PDF uses the new design, shows EUR/INR where applicable, AWB folded
  into description, and the **Download** button saves a PDF via the new path.

## 8. Documents — per-type tabs (customer & supplier)

Customer tabs: **Quotation, Proforma, Sales Order, Delivery Challan, Credit Note**.
Supplier tabs: **Purchase Order, Debit Note, Delivery Challan**.

For **each** type:
- **New** opens a **full-page** form (no popup, no one-option dropdown).
- Number auto-fills as `{PREFIX}-{CODE}{YY}{NNNN}` (PREFIX = company prefix; codes: QT, PI,
  SO, DC, CN, PO, DN, SDC), running **per company**, and recomputes when company changes.
- **Non-reusable numbers:** create #0001, #0002; **delete #0002**; create again → must be
  **#0003**, never re-issue 0002. Repeat across a company boundary (independent per company).
- **Pencil** icon → full edit of all details + lines; save persists.
- **Print/PDF** uses the 31-design with correct title, party label, status note, terms,
  bank, signatory.
- Supplier **Delivery Challan** is kept **separate** from customer challans (own `SDC`
  series, own tab, never mixed).

## 9. Convert flows (the "Convert →" modal)

- The **Convert** control is a labelled button opening a **centered modal** that is **never
  clipped/hidden** (test on the last row and on narrow screens).
- Sell chain conversions carry party + line items forward and record a link:
  Quotation → Sales Order → Proforma → Delivery Challan → **Tax Invoice**; and starting
  mid-chain (e.g. straight from Proforma) works.
- **Credit Note from an invoice**: the invoice detail "+ Credit Note" prefills from the
  invoice and links it as an adjustment.
- **Buy chain**: **Convert PO → Supplier Bill** creates a *draft* supplier bill (supplier +
  PO total + "From PO…"), marks PO Converted, and lands on Supplier Invoices — and that
  draft bill can still be **bundled/paid** normally. **+ Debit note** on a supplier bill row
  prefills and links a debit note.

## 10. Chain ribbon (chevron flow) — real-time

- Open any chain document/invoice: the chevron ribbon shows the stages with **green =
  exists/done**, **amber = the one you're on / unpaid invoice/bill**, **red = not yet
  created**. Existing stages are **clickable** and open that document.
- **Real-time correctness**: open a month-old Proforma and confirm it shows whether it was
  invoiced and **Paid/Unpaid**. The **Tax Invoice** and **Supplier Bill** chevrons show
  **Paid/Unpaid** from their actual payment state.
- Verify both the **sell** ribbon (customer docs + tax invoice detail) and the **buy** ribbon
  (PO + debit note edit).

## 11. Signatories on PDFs

- The chosen signatory's image prints on tax invoices, all document types, courier/
  reimbursable invoices, and **salary slips**.
- **Salary slips: per employee's own company** — a payroll run mixing companies shows each
  slip with its own company's signatory (default), overridable per run.

## 12. Payroll

- Processing month: generate entries, edit rows, **finalize a subset** (only ticked
  employees), finalize without logging income, **Mark as Paid**, undo.
- **Bank CSV** includes only chosen employees; filename is a **running number**
  (BULK.csv, BULK2.csv…).
- Slips page + slip **PDF** uses the restyled band design (accent strip, 5.5 cm logo,
  signatory), downloads correctly.

## 13. Cheques, Banks, Assets, Books

- **Cheque module**: per-bank calibrated template, print exact-size PDF, amount-in-words,
  A/C-payee toggle, standalone write-cheque with account-type restrictions + transactions.
- **Banks setup** + linking accounts to banks; calibration image loads (public bucket).
- **Assets**: mark sold + selling price → **realised profit**, sold filter, grand totals,
  full numbers (no Cr/L abbreviations).
- **Books**: net worth (excludes sold/inactive), trial balance (balances, drill-down),
  P&L period selector, balance sheet, **Journal** audit trail (auto-synced), CSV export.
  Sanity-check the numbers against the underlying transactions.

## 14. Cross-cutting & security

- **RLS**: with a second test user, confirm no cross-user data access on every table
  (companies, customers, suppliers, invoices, documents, document_links, payroll, books).
- Empty states, loading states, and error states (e.g. save with missing required fields,
  network failure) behave gracefully — no unhandled exceptions.
- Concurrency on numbering: rapidly create documents; confirm **no duplicate numbers**.
- PDFs: text is legible, layout not clipped, multi-page invoices paginate.

---

## 15. Required report format

Deliver a single `QA_REPORT.md` with:

1. **Summary table** — module × status (Pass / Fail / Partial) × # issues.
2. **Gate results** — tsc, lint, build, migrations (pass/fail + output snippets).
3. **Findings** — one entry per issue:
   `[Severity] Module — Title` · Steps to reproduce · Expected · Actual · Evidence
   (console/network/DB/screenshot) · Reproducibility (how many of the 3 passes hit it).
4. **Regression check** — explicit confirmation that courier / reimbursable / supplier
   bundling and payroll still work unchanged.
5. **Flakiness** — anything that passed some runs and failed others.
6. **Prioritised fix list** — Blockers first, then Major, Minor, Cosmetic.
7. **Coverage statement** — which checks were UI-automated, which were API+DB verified, and
   anything you could NOT test (and why).

Run the suite **three times**, then write the report. Be specific and honest — a clean
report that hides a real bug is worse than a messy one that finds it.
