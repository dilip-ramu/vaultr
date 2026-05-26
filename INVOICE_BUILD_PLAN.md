# Recoverables Phase 2 — GST Invoicing Build Plan

## What this builds
1. Extend the existing Customers module with GST invoicing fields + CSV alias
2. Rename "supplier" → "customer" everywhere in the recoverables module
3. Auto-link CSV columns to customer master via csv_alias; warn + prompt to link/create when unmatched
4. Invoice creation flow: select customer → pick AWBs → set markup → generate GST invoice
5. GST-compliant print/PDF view matching CNTR-000019 format (pulls address/GSTIN from customer record)
6. Customer ledger updated: unbilled / pending / overdue / settled / profitability
7. Invoice list with bill numbers, amounts, due dates, days overdue

---

## Customer master (existing `customers` table extended)

The `customers` table already has: name, email, phone, address, gst_number, notes.

**New fields added via migration:**
- `city TEXT` — city name
- `state TEXT` — state name (e.g. "Tamil Nadu")
- `state_code TEXT` — GST state code (e.g. "33")
- `pincode TEXT` — 6-digit PIN
- `country TEXT DEFAULT 'India'`
- `csv_alias TEXT` — the EXACT column header used in CSV imports (e.g. "SURIYAA KNITWEAR"). Used to auto-link allocations to customer records during import.

**CSV matching logic (in parser/import):**
- On import, for each supplier column header, look up `customers WHERE csv_alias = columnHeader AND user_id = $1`
- If match found: set `customer_id` on the allocation
- If no match: `customer_id` stays null, `customer_name` stores the raw column header
- After import, the batch detail page shows a warning banner: "X columns not linked to customers" with a [Link Now] action that opens a customer picker or quick-create drawer

**Customer module UI additions:**
- Add "CSV Alias" field to the customer create/edit form
- In customer detail page: show a "Recoverables" tab → unbilled AWBs + invoice history

---

## Invoice logic (understand before building)

- **Markup is internal only.** If base cost = ₹150/pc and markup = 12%, invoice shows rate = ₹168/pc. The markup is stored in `recoverable_invoice_lines.base_rate` but never rendered on the PDF.
- **GST:** CGST 9% + SGST 9% per line. Applied on top of (qty × rate). Subtotal = sum of line amounts before GST.
- **Invoice number:** prefix (e.g. "CNTR-") + zero-padded 6-digit counter (e.g. CNTR-000019). Stored in `recoverable_invoice_settings.next_invoice_number` per user, incremented atomically on each create.
- **Status flow:** `draft` → `sent` → `paid` (or `overdue`, `cancelled`)
- **Profitability:** revenue (qty × invoice rate) − cost (qty × base rate) per customer, per period.

---

## Database schema (migration_v10)

```sql
-- Invoice settings per user
CREATE TABLE recoverable_invoice_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_prefix       TEXT NOT NULL DEFAULT 'INV-',
  next_invoice_number  INT  NOT NULL DEFAULT 1,
  cgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  sgst_rate            DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  hsn_sac              TEXT NOT NULL DEFAULT '996812',
  payment_terms        TEXT NOT NULL DEFAULT 'due_on_receipt',
  company_name         TEXT,
  company_address      TEXT,
  company_gstin        TEXT,
  company_phone        TEXT,
  company_email        TEXT,
  bank_account_name    TEXT,
  bank_account_number  TEXT,
  bank_ifsc            TEXT,
  bank_name            TEXT,
  terms_conditions     TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The invoice
CREATE TABLE recoverable_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_address TEXT,
  customer_gstin   TEXT,
  customer_state   TEXT,
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,
  payment_terms    TEXT NOT NULL DEFAULT 'due_on_receipt',
  -- markup (internal, not shown on invoice)
  markup_type      TEXT NOT NULL DEFAULT 'none' CHECK (markup_type IN ('percentage','flat','none')),
  markup_value     DECIMAL(10,4) NOT NULL DEFAULT 0,
  -- financials
  subtotal         DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst_rate        DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  sgst_rate        DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  cgst_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total            DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  balance_due      DECIMAL(15,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  currency         TEXT NOT NULL DEFAULT 'INR',
  notes            TEXT,
  pdf_path         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, invoice_number)
);

-- One row per AWB per invoice
CREATE TABLE recoverable_invoice_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES recoverable_invoices(id) ON DELETE CASCADE,
  allocation_id UUID REFERENCES recoverable_allocations(id) ON DELETE SET NULL,
  line_number   INT  NOT NULL,
  awb           TEXT NOT NULL,
  shipment_date DATE,
  hsn_sac       TEXT NOT NULL DEFAULT '996812',
  qty           INT  NOT NULL DEFAULT 0,
  base_rate     DECIMAL(15,4) NOT NULL DEFAULT 0,  -- actual cost/pc, never shown on invoice
  rate          DECIMAL(15,4) NOT NULL DEFAULT 0,  -- rate shown on invoice (with markup)
  amount        DECIMAL(15,2) NOT NULL DEFAULT 0,  -- qty × rate
  cgst_rate     DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  cgst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_rate     DECIMAL(5,2)  NOT NULL DEFAULT 9.00,
  sgst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Rename supplier_name to customer_name in existing tables
ALTER TABLE recoverable_allocations  RENAME COLUMN supplier_name TO customer_name;
ALTER TABLE recoverable_allocations  RENAME CONSTRAINT IF EXISTS ... -- handled via policy rename

-- Update indexes
DROP INDEX IF EXISTS idx_ra_supplier;
CREATE INDEX IF NOT EXISTS idx_ra_customer_name ON recoverable_allocations(user_id, customer_name, status);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_ri_user_id      ON recoverable_invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ri_customer     ON recoverable_invoices(user_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_ril_invoice     ON recoverable_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ril_allocation  ON recoverable_invoice_lines(allocation_id);

-- RLS
ALTER TABLE recoverable_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_invoice_lines     ENABLE ROW LEVEL SECURITY;

GRANT ALL ON recoverable_invoice_settings TO authenticated;
GRANT ALL ON recoverable_invoices          TO authenticated;
GRANT ALL ON recoverable_invoice_lines     TO authenticated;

DROP POLICY IF EXISTS "ris_select"  ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_insert"  ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_update"  ON recoverable_invoice_settings;
DROP POLICY IF EXISTS "ris_delete"  ON recoverable_invoice_settings;
CREATE POLICY "ris_select" ON recoverable_invoice_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ris_insert" ON recoverable_invoice_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ris_update" ON recoverable_invoice_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ris_delete" ON recoverable_invoice_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rinv_select" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_insert" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_update" ON recoverable_invoices;
DROP POLICY IF EXISTS "rinv_delete" ON recoverable_invoices;
CREATE POLICY "rinv_select" ON recoverable_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rinv_insert" ON recoverable_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rinv_update" ON recoverable_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rinv_delete" ON recoverable_invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ril_select" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_insert" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_update" ON recoverable_invoice_lines;
DROP POLICY IF EXISTS "ril_delete" ON recoverable_invoice_lines;
CREATE POLICY "ril_select" ON recoverable_invoice_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ril_insert" ON recoverable_invoice_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ril_update" ON recoverable_invoice_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ril_delete" ON recoverable_invoice_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_ri_updated_at ON recoverable_invoices;
CREATE TRIGGER trg_ri_updated_at BEFORE UPDATE ON recoverable_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## New file tree

```
app/(app)/recoverables/
  customers/[name]/page.tsx          ← was suppliers/[name]/page.tsx
  invoices/
    page.tsx                         ← invoice list
    new/page.tsx                     ← create invoice (query: ?customer=NAME)
    [id]/page.tsx                    ← invoice detail
    [id]/print/page.tsx              ← print/PDF view (no nav, print CSS)
  settings/page.tsx                  ← invoice settings

components/recoverables/
  customer/
    CustomerLedgerClient.tsx         ← was SupplierLedgerClient.tsx (updated)
  invoices/
    InvoiceListClient.tsx
    CreateInvoiceClient.tsx          ← 3-step wizard
    InvoiceDetailClient.tsx
    InvoicePrintView.tsx             ← the actual PDF-quality render
    AWBSelector.tsx                  ← checklist of pending AWBs
    MarkupInput.tsx                  ← % or flat amount toggle
  settings/
    InvoiceSettingsClient.tsx

app/api/recoverables/
  invoices/
    route.ts                         ← GET list, POST create
    [id]/route.ts                    ← GET, PATCH (status), DELETE
  invoice-settings/
    route.ts                         ← GET, PUT

lib/recoverables/
  invoices/
    calculator.ts                    ← compute lines, GST, totals
    number.ts                        ← invoice number generation
    words.ts                         ← amount to words (Indian)
```

---

## Prompt 0 — Extend Customer Master + CSV Alias

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

1. Create supabase/migration_v10a_customer_fields.sql:

ALTER TABLE customers ADD COLUMN IF NOT EXISTS city        TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state       TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state_code  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pincode     TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country     TEXT DEFAULT 'India';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS csv_alias   TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_csv_alias ON customers(user_id, csv_alias);

2. Update lib/types.ts Customer interface to add:
   city, state, state_code, pincode, country, csv_alias (all string | null)

3. Update components/customers/CustomerForm.tsx (or wherever create/edit form lives):
   - Add fields: City, State, State Code (2-digit GST code, e.g. 33), Pincode, Country
   - Add "CSV Alias" field with helper text: "Exact column header name used in your courier CSV files. Used to auto-match imports."
   - All new fields optional

4. Update app/api/recoverables/import/route.ts:
   After CSV parsing and before inserting allocations, perform customer lookup:
   - Collect all unique supplier column names from the CSV
   - Run: SELECT id, name, csv_alias FROM customers WHERE user_id = $1 AND csv_alias = ANY($2)
   - Build a map: csvAlias → customerId
   - When building allocationRows, set customer_id from this map (or null if not found)
   - In the batch summary response, add: unmatchedCustomers: string[] (column names with no customer match)

5. Update components/recoverables/import/ImportPageClient.tsx:
   After a successful import (stage=done), if summary.unmatchedCustomers?.length > 0:
   Show a yellow warning card: "X customer columns were not matched to your customer master: [Nike, Adidas]. Add them in Customers → set their CSV Alias to match."
   With a button "Go to Customers →" that links to /customers

6. Update app/api/recoverables/import/route.ts response to include unmatchedCustomers in the success response.

Build must pass: npx tsc --noEmit
```

---

## Prompt 1 — DB Migration + Terminology Rename

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create supabase/migration_v10_invoices.sql with the following:

1. Rename column supplier_name → customer_name in recoverable_allocations:
   ALTER TABLE recoverable_allocations RENAME COLUMN supplier_name TO customer_name;
   DROP INDEX IF EXISTS idx_ra_supplier;
   CREATE INDEX IF NOT EXISTS idx_ra_customer_name ON recoverable_allocations(user_id, customer_name, status);

2. Drop and recreate RLS policies on recoverable_allocations that reference supplier_name (they use user_id so no change needed, but rename the policy names):
   DROP POLICY IF EXISTS "ra_select" ON recoverable_allocations;
   DROP POLICY IF EXISTS "ra_insert" ON recoverable_allocations;
   DROP POLICY IF EXISTS "ra_update" ON recoverable_allocations;
   DROP POLICY IF EXISTS "ra_delete" ON recoverable_allocations;
   CREATE POLICY "ra_select" ON recoverable_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
   CREATE POLICY "ra_insert" ON recoverable_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "ra_update" ON recoverable_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "ra_delete" ON recoverable_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);

3. Create recoverable_invoice_settings table (see schema above).
4. Create recoverable_invoices table (see schema above).
5. Create recoverable_invoice_lines table (see schema above).
6. Add all indexes.
7. Enable RLS + GRANT ALL to authenticated for all three new tables.
8. Create per-operation DROP IF EXISTS + CREATE policies for all three tables.
9. Add updated_at trigger for recoverable_invoices (reuse set_updated_at function from v9).

Then update ALL references to supplier_name in the codebase:
- lib/recoverables/engine/balance.ts: replace supplier_name with customer_name, supplierName with customerName, SupplierBalance fields: supplierName→customerName, update DashboardStats: supplierCount→customerCount
- lib/recoverables/types.ts: in SupplierBalance rename supplierName→customerName; in DashboardStats rename supplierCount→customerCount; in RecoverableAllocation rename supplier_name→customer_name
- components/recoverables/dashboard/SupplierBalances.tsx: rename to CustomerBalances.tsx. Change all "supplier" text to "customer". Update route from /recoverables/suppliers/ to /recoverables/customers/. Update props interface.
- components/recoverables/dashboard/RecoverablesDashboardClient.tsx: update import from SupplierBalances to CustomerBalances, update section heading "Pending by Supplier" to "Pending by Customer"
- app/(app)/recoverables/page.tsx: update query column supplier_name→customer_name, update balance engine calls
- app/(app)/recoverables/suppliers/[name]/page.tsx → move/rename to app/(app)/recoverables/customers/[name]/page.tsx. Update all supplier_name references to customer_name.
- components/recoverables/supplier/SupplierLedgerClient.tsx → move to components/recoverables/customer/CustomerLedgerClient.tsx. Rename all prop names and internal references from "supplier" to "customer".
- app/api/recoverables/suppliers/[name]/route.ts: update query column supplier_name → customer_name
- app/api/recoverables/import/route.ts: update buildAllocationRows to use customer_name instead of supplier_name
- lib/recoverables/csv/balance.ts and any other engine files that reference supplier_name

After rename, do NOT delete the old suppliers directory — leave it but make app/(app)/recoverables/suppliers/[name]/page.tsx redirect to /recoverables/customers/[name] for backward compatibility.

Build must pass: npx tsc --noEmit
```

---

## Prompt 2 — Invoice lib (calculator, number generator, amount-to-words)

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create lib/recoverables/invoices/calculator.ts:
- Export interface InvoiceLine { allocationId, awb, shipmentDate, qty, baseRate, rate, amount, cgstRate, cgstAmount, sgstRate, sgstAmount }
- Export interface InvoiceTotals { lines: InvoiceLine[], subtotal, cgstAmount, sgstAmount, total, balanceDue }
- Export function buildInvoiceLines(allocations: RecoverableAllocation[], shipments: RecoverableShipment[], markupType: 'percentage'|'flat'|'none', markupValue: number, cgstRate: number, sgstRate: number): InvoiceLines[]
  - For each allocation:
    - base_rate = allocation.base_cost / allocation.pieces (per piece)
    - rate = markupType==='percentage' ? round4(base_rate * (1 + markupValue/100)) : markupType==='flat' ? round4(base_rate + markupValue) : base_rate
    - amount = round2(allocation.pieces * rate)
    - cgstAmount = round2(amount * cgstRate / 100)
    - sgstAmount = round2(amount * sgstRate / 100)
    - shipmentDate: from shipments map by allocation.shipment_id → shipment.shipment_date
    - awb: from shipments map by allocation.shipment_id → shipment.reference
  - Return lines sorted by shipmentDate asc, then awb asc
- Export function calcTotals(lines: InvoiceLine[], cgstRate: number, sgstRate: number): InvoiceTotals
  - subtotal = sum of line amounts
  - cgstAmount = round2(subtotal * cgstRate / 100)
  - sgstAmount = round2(subtotal * sgstRate / 100)
  - total = round2(subtotal + cgstAmount + sgstAmount)
  - balanceDue = total (paid_amount starts at 0)

Create lib/recoverables/invoices/number.ts:
- Export async function getNextInvoiceNumber(supabase, userId: string): Promise<string>
  - Upsert into recoverable_invoice_settings: if no row exists, create with defaults
  - Read current prefix + next_invoice_number
  - Increment next_invoice_number in DB
  - Return prefix + String(next_invoice_number - 1).padStart(6, '0')
  - Use a transaction-safe approach: UPDATE recoverable_invoice_settings SET next_invoice_number = next_invoice_number + 1 WHERE user_id = $1 RETURNING next_invoice_number, invoice_prefix

Create lib/recoverables/invoices/words.ts:
- Export function amountToWords(amount: number, currency: string = 'INR'): string
- Converts 2227.18 → "Indian Rupee Two Thousand Two Hundred Twenty-Seven and Eighteen Paise Only"
- Full Indian number system (lakh, crore not needed for now, up to 99,99,999 is fine)
- Currency prefix: INR → "Indian Rupee", USD → "US Dollar", EUR → "Euro"
- Paise suffix: the decimal part → "X Paise Only", if .00 → "Only"

Build must pass: npx tsc --noEmit
```

---

## Prompt 3 — API Routes (invoices + settings)

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create app/api/recoverables/invoices/route.ts:

GET handler:
- Auth check (createClient)
- Query recoverable_invoices WHERE user_id = user.id ORDER BY created_at DESC
- Return { invoices }

POST handler (create invoice):
- Auth check
- Body: { customerName, customerId?, markupType, markupValue, allocationIds: string[], invoiceDate, paymentTerms, notes? }
- Validate: allocationIds non-empty, customerName non-empty
- Fetch allocations + their shipments in one go
- Call getNextInvoiceNumber(supabase, user.id)
- Calculate due_date from paymentTerms: 'due_on_receipt'→same as invoiceDate, 'net_7'→+7d, 'net_15'→+15d, 'net_30'→+30d
- Fetch invoice settings for cgstRate, sgstRate
- Build lines using buildInvoiceLines()
- Calc totals using calcTotals()
- Insert recoverable_invoices row (status='draft')
- Insert recoverable_invoice_lines rows (batch, chunks of 100)
- UPDATE recoverable_allocations SET status='billed', billed_at=NOW() WHERE id IN (allocationIds)
- UPDATE recoverable_invoices SET status='sent', sent_at=NOW() WHERE id = newInvoiceId (invoices are immediately sent)
- Return { success: true, invoiceId, invoiceNumber }

Create app/api/recoverables/invoices/[id]/route.ts:

GET handler:
- Fetch invoice + lines + linked customer
- Return { invoice, lines, customer }

PATCH handler:
- Body: { status: 'paid'|'cancelled', paidAmount?, paidAt? }
- Validate ownership
- Update status, paid_at, balance_due
- If status=paid: also UPDATE all linked allocations SET status='paid'
- Return updated invoice

DELETE handler:
- Validate ownership
- Revert linked allocations: UPDATE SET status='pending', billed_at=NULL WHERE id IN (SELECT allocation_id FROM recoverable_invoice_lines WHERE invoice_id=$1)
- Delete invoice (cascades to lines)
- Return { success: true }

Create app/api/recoverables/invoice-settings/route.ts:

GET: fetch settings for user (upsert default if not exists), return settings
PUT: body is partial settings object, upsert into recoverable_invoice_settings

All routes use createClient (cookie-based auth). No admin client.
Build must pass: npx tsc --noEmit
```

---

## Prompt 4 — Create Invoice UI (3-step wizard)

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create app/(app)/recoverables/invoices/new/page.tsx:
- Server component
- Read query param ?customer=NAME (decodeURIComponent)
- If customer provided, fetch all pending allocations for that customer + their shipments
- Fetch invoice settings
- Pass to CreateInvoiceClient

Create components/recoverables/invoices/CreateInvoiceClient.tsx:
3-step wizard (Step indicator at top: "1 Select AWBs → 2 Markup → 3 Review"):

Step 1 — AWB Selection:
- Header: back button + "New Invoice for [customerName]"
- If no customerName provided: show a customer picker (distinct customer_name values from pending allocations, fetched on mount via GET /api/recoverables/invoices?pendingCustomers=true... actually just pass from server)
- Show pending allocations grouped by batch. Each row: checkbox, AWB, date, qty (pieces), base amount (no markup shown)
- "Select All" button at top
- Running total at bottom: "X AWBs selected — ₹Y (before GST)"
- "Continue →" button (disabled if 0 selected)

Step 2 — Markup:
- Heading: "Apply markup to selected AWBs"
- Toggle: "Percentage" | "Flat per piece"
- Number input: if percentage → shows "%", if flat → shows "₹ per piece"
- Live preview: "Base: ₹X → After markup: ₹Y (+Z%)" where X/Y are the totals
- Payment terms selector: Due on Receipt / Net 7 / Net 15 / Net 30
- Invoice date picker (default today)
- Optional notes
- "Preview Invoice →" button

Step 3 — Review:
- Shows a compact preview of all line items (AWB, date, qty, rate with markup applied, amount)
- Sub Total, CGST 9%, SGST 9%, Total
- "Create Invoice" button (shows spinner while calling POST /api/recoverables/invoices)
- On success: router.push('/recoverables/invoices/[newId]')

Style: use CSS variables (--brand, --surface-2, --border, --text, --text-muted), card components, same design language as the rest of the app. Mobile-first.

Build must pass: npx tsc --noEmit
```

---

## Prompt 5 — Invoice List + Detail Pages

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create app/(app)/recoverables/invoices/page.tsx:
- Server component, fetch all invoices for user
- Pass to InvoiceListClient

Create components/recoverables/invoices/InvoiceListClient.tsx:
- Filter tabs: All | Draft | Sent | Overdue | Paid
- Each invoice card shows:
  - Invoice number (e.g. CNTR-000019) — bold
  - Customer name
  - Invoice date
  - Total amount
  - Status badge (use StatusBadge component)
  - If status=sent and due_date < today: show "Overdue by X days" in red
  - If status=sent: show "Due: [date]" 
- Click → navigate to /recoverables/invoices/[id]
- Empty state per tab
- FAB or top-right "New Invoice" button → /recoverables/invoices/new

Create app/(app)/recoverables/invoices/[id]/page.tsx:
- Server component, fetch invoice + lines + settings
- Pass to InvoiceDetailClient

Create components/recoverables/invoices/InvoiceDetailClient.tsx:
- Header: back button + invoice number + status badge
- Action buttons:
  - "Mark as Paid" (if status=sent/overdue) → PATCH /api/recoverables/invoices/[id]
  - "Print / Download PDF" → opens /recoverables/invoices/[id]/print in new tab
  - "Delete" (with confirmation, only if status=draft/cancelled)
- Summary card: Customer, Invoice Date, Due Date, Payment Terms, Balance Due
- Line items table: #, AWB, Date, Qty, Rate, CGST, SGST, Amount
- Totals: Sub Total, CGST (9%), SGST (9%), Total, Balance Due
- If paid: shows "Paid ✓" with paid date

Build must pass: npx tsc --noEmit
```

---

## Prompt 6 — Print / PDF View (matches CNTR-000019 format)

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create app/(app)/recoverables/invoices/[id]/print/page.tsx:
- Server component (no layout — this page has its own standalone layout)
- Fetch invoice + lines + invoice_settings for user
- Render InvoicePrintView directly (no AppShell wrapper)
- Add metadata: title = invoice number

Create components/recoverables/invoices/InvoicePrintView.tsx:
A4-format HTML invoice matching the CNTR-000019.pdf structure exactly:

LAYOUT (top to bottom):
1. Header row:
   - Left: Company name in large bold text (from settings.company_name)
   - Right: "Tax Invoice" heading + "# [invoice_number]" below it

2. Two-column block:
   - Left: Company address, GSTIN, phone, email (from settings)
   - Right (top-right corner): "Balance Due" label + "₹[balanceDue]" in large bold

3. Bill To block:
   - "Bill To" label
   - Customer name (bold)
   - Customer address
   - "GSTIN: [customer_gstin]" (×2 lines as in sample)

4. Right-aligned metadata: Invoice Date / Terms / Due Date

5. Ship To: GSTIN line

6. "Place Of Supply: Tamil Nadu (33)" (or derive from customer state)

7. Line items table:
   Columns: # | Item & Description | HSN/SAC | Qty | Rate | CGST | SGST | Amount
   - # = line_number
   - Item & Description = shipment_date (formatted dd/mm/yy) on line 1, AWB on line 2
   - HSN/SAC = 996812
   - Qty = qty
   - Rate = rate (formatted to 3dp, the invoice rate with markup — base_rate NOT shown)
   - CGST = cgst_amount + "\n" + cgst_rate + "%"
   - SGST = sgst_amount + "\n" + sgst_rate + "%"
   - Amount = amount (2dp)
   Table has a header row with subtle background, alternating row colors.

8. Totals section (right-aligned):
   - Sub Total: [subtotal]
   - CGST[rate] ([rate]%): [cgstAmount]
   - SGST[rate] ([rate]%): [sgstAmount]
   - Total (bold): ₹[total]
   - Balance Due (bold, larger): ₹[balanceDue]

9. "Total In Words:" row — use amountToWords() from lib/recoverables/invoices/words.ts

10. Bank details (bottom left):
    Account Number / Account Name / IFSC / Bank Name (from settings)

11. Terms & Conditions heading + text (from settings)

12. "For [company_name]" + "Proprietor" + "Authorized Signature" at bottom right

CSS rules:
- @media print: hide the print button, set margin:0, use A4 sizing
- @media screen: show a "Print / Download PDF" button fixed at top-right, center the A4 sheet with a shadow
- Font: system-ui, no external fonts (for fast load)
- Colors: black text, #000 borders, white background — pure print-safe
- All amounts formatted with en-IN locale

Add a print button component visible only on screen:
<button onclick="window.print()"> Print / Download PDF </button>

Build must pass: npx tsc --noEmit
```

---

## Prompt 7 — Customer Ledger (Phase 2) + Recoverables Nav Update

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Update components/recoverables/customer/CustomerLedgerClient.tsx with:

Summary cards row at top (4 cards):
- Unbilled: sum of pending allocations (no invoice yet)
- Billed: sum of invoices with status=sent (amount = balance_due)
- Overdue: sum of invoices where status=sent and due_date < today
- Settled: sum of invoices with status=paid

Profitability card:
- Revenue = sum of invoice line amounts (rate × qty) for this customer
- Cost = sum of allocation base_cost for this customer  
- Profit = Revenue - Cost
- Margin = Profit / Revenue × 100
- Show as: "₹X profit (Y%)"

Two sections:
1. "Invoices" — table/list showing all invoices for this customer:
   - Invoice number (link to /recoverables/invoices/[id])
   - Invoice date
   - Amount
   - Status badge
   - Due date
   - If overdue: "Overdue by X days" in red
   - Payment terms

2. "Unbilled AWBs" — pending allocations not yet on any invoice:
   - Same list as before (AWB, date, qty, amount)
   - "Create Invoice" button above the list → /recoverables/invoices/new?customer=[name]
   - Checkbox selection optional (or just a button for now)

Update app/(app)/recoverables/customers/[name]/page.tsx:
- Fetch allocations, invoices (JOIN invoice_lines to get this customer's invoices), shipments, settings
- Pass all to CustomerLedgerClient

Update AppShell.tsx:
- Add "Invoices" sub-nav under the Recoverables section OR add a direct nav item
  pointing to /recoverables/invoices

Update components/recoverables/dashboard/RecoverablesDashboardClient.tsx:
- Update section heading to "Pending by Customer"
- Add "View All Invoices" link to the invoice list page

Build must pass: npx tsc --noEmit
```

---

## Prompt 8 — Invoice Settings Page

```
You are working on the Vaultr Next.js app at /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr.

Create app/(app)/recoverables/settings/page.tsx:
- Server component, fetch settings via supabase query (or default values if none)
- Pass to InvoiceSettingsClient

Create components/recoverables/settings/InvoiceSettingsClient.tsx:
Form with sections:

1. Company Details (appears on every invoice):
   - Company Name *
   - Address (textarea)
   - GSTIN
   - Phone
   - Email

2. Invoice Defaults:
   - Invoice Prefix (e.g. "CNTR-") — shows live preview: CNTR-000019
   - Current counter (read-only display: "Next invoice will be [prefix][nextNum]")
   - CGST Rate % (default 9)
   - SGST Rate % (default 9)
   - HSN/SAC code (default 996812)
   - Default Payment Terms (dropdown)

3. Bank Details (shown on invoice):
   - Account Name
   - Account Number
   - IFSC
   - Bank Name & Branch

4. Terms & Conditions (textarea)

Save button → PUT /api/recoverables/invoice-settings
Show success toast on save.

Add a "Settings" link in the recoverables section — either in the dashboard header as a gear icon, or in AppShell sub-nav.

Build must pass: npx tsc --noEmit
```

---

## Running order

Run prompts in order 0 → 8.

After Prompt 0: paste migration_v10a SQL into Supabase SQL Editor and run it.
After Prompt 1: paste migration_v10 SQL into Supabase SQL Editor and run it.
After Prompt 8: git add -A && git commit -m "feat: GST invoicing for recoverables" && git push

## Workflow summary (for the user)

1. Go to **Customers** → Add each customer (Suriyaa Knitwear, Nike, etc.)
   - Fill GSTIN, address, state, state code
   - Set **CSV Alias** = exact column header used in your CSV (case-sensitive match)

2. **Import CSV** → allocations auto-link to customers via alias
   - If a column has no match, a warning shows with a link to fix it

3. Go to **Recoverables → Customers → [Customer Name]**
   - See all pending AWBs for that customer
   - Click **Create Invoice** → select AWBs → set markup → confirm

4. Invoice is created, AWBs marked as Billed
   - Click **Print / Download PDF** → opens A4 invoice → Ctrl+P to save as PDF

5. When customer pays → **Mark as Paid** → AWBs move to Settled
