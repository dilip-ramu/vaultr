# Vaultr — Recoverables Module: Architecture & Build Plan

> Replace the old logistics/courier module with a lightweight, CSV-powered
> Recoverable Expense Management system called **Recoverables**.

---

## 1. Safe Removal Strategy

### What to delete (logistics-specific only)
```
app/(app)/logistics/          ← all routes
components/logistics/         ← all components
lib/logistics/                ← all services (keep nothing)
app/api/logistics/            ← all API routes
```

### What NOT to delete
```
lib/supabase/client.ts        shared
lib/supabase/server.ts        shared
components/shared/            shared
components/AppShell.tsx       update nav only
lib/types.ts                  shared (customers, accounts etc.)
lib/utils.ts                  shared
```

### Database migrations: DO NOT DROP
Mark the following migration files as deprecated but leave them in place.
The tables they create (`courier_invoices`, `awbs`, `awb_allocations`,
`markup_rules`, `supplier_invoices`, `supplier_invoice_lines`) can be
dropped manually after confirming zero production rows:
```
supabase/migration_v8_logistics.sql      ← deprecated
supabase/migration_v8b_analytics_view.sql ← deprecated
supabase/migration_v8c_gst.sql           ← deprecated
supabase/migration_v8d_rls_fix.sql       ← deprecated
```

### AppShell nav change
- Remove: `{ href: '/logistics', label: 'Logistics', icon: Package }`
- Add:    `{ href: '/recoverables', label: 'Recoverables', icon: ArrowDownUp }`

---

## 2. New Module: Recoverables

### Purpose
Track operational expenses that are recoverable from customers/suppliers.
- Courier charges allocated across customers
- Sample costs billed to suppliers
- Testing charges
- Any operational expense to be recovered

### Core Workflow
```
CSV Upload → Parse & Validate → Preview → Process
→ Store allocations per supplier → Dashboard / Ledger
```

---

## 3. Database Schema

### File: `supabase/migration_v9_recoverables.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration v9: Recoverables Module
-- Additive only. Safe to run on production.
-- ═══════════════════════════════════════════════════════════

-- ── 1. recoverable_import_batches ───────────────────────────
CREATE TABLE IF NOT EXISTS recoverable_import_batches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  source           TEXT,
  import_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  currency         TEXT NOT NULL DEFAULT 'INR',
  csv_path         TEXT,
  row_count        INT  NOT NULL DEFAULT 0,
  reference_count  INT  NOT NULL DEFAULT 0,
  supplier_count   INT  NOT NULL DEFAULT 0,
  total_cost       DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_recoverable DECIMAL(15,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processed','failed')),
  validation_errors JSONB,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. recoverable_shipments ────────────────────────────────
-- One row per unique reference (AWB / sample ID / job code) per batch.
CREATE TABLE IF NOT EXISTS recoverable_shipments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id       UUID NOT NULL REFERENCES recoverable_import_batches(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL,
  total_cost     DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_pieces   INT  NOT NULL DEFAULT 0,
  per_piece_cost DECIMAL(15,4) GENERATED ALWAYS AS (
    CASE WHEN total_pieces > 0 THEN total_cost / total_pieces ELSE 0 END
  ) STORED,
  source         TEXT,
  shipment_date  DATE,
  destination    TEXT,
  weight_kg      DECIMAL(10,3),
  raw_row        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, reference)
);

-- ── 3. recoverable_allocations ──────────────────────────────
-- One row per supplier per shipment.
CREATE TABLE IF NOT EXISTS recoverable_allocations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id           UUID NOT NULL REFERENCES recoverable_import_batches(id) ON DELETE CASCADE,
  shipment_id        UUID NOT NULL REFERENCES recoverable_shipments(id) ON DELETE CASCADE,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_name      TEXT NOT NULL,
  pieces             INT  NOT NULL DEFAULT 0,
  base_cost          DECIMAL(15,4) NOT NULL DEFAULT 0,
  markup_type        TEXT NOT NULL DEFAULT 'none'
                     CHECK (markup_type IN ('percentage','flat','none')),
  markup_value       DECIMAL(10,4) NOT NULL DEFAULT 0,
  markup_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  recoverable_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','billed','paid','cancelled')),
  billed_at          TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rib_user_id   ON recoverable_import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_rs_batch_id   ON recoverable_shipments(batch_id);
CREATE INDEX IF NOT EXISTS idx_ra_batch_id   ON recoverable_allocations(batch_id);
CREATE INDEX IF NOT EXISTS idx_ra_supplier   ON recoverable_allocations(user_id, supplier_name, status);
CREATE INDEX IF NOT EXISTS idx_ra_customer   ON recoverable_allocations(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_ra_shipment   ON recoverable_allocations(shipment_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE recoverable_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_shipments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoverable_allocations     ENABLE ROW LEVEL SECURITY;

GRANT ALL ON recoverable_import_batches TO authenticated;
GRANT ALL ON recoverable_shipments       TO authenticated;
GRANT ALL ON recoverable_allocations     TO authenticated;

-- Separate per-operation policies (avoids the FOR ALL + WITH CHECK bug)
DO $$ BEGIN
  -- recoverable_import_batches
  CREATE POLICY "rib_select" ON recoverable_import_batches FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY "rib_insert" ON recoverable_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "rib_update" ON recoverable_import_batches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "rib_delete" ON recoverable_import_batches FOR DELETE TO authenticated USING (auth.uid() = user_id);
  -- recoverable_shipments
  CREATE POLICY "rs_select" ON recoverable_shipments FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY "rs_insert" ON recoverable_shipments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "rs_update" ON recoverable_shipments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "rs_delete" ON recoverable_shipments FOR DELETE TO authenticated USING (auth.uid() = user_id);
  -- recoverable_allocations
  CREATE POLICY "ra_select" ON recoverable_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY "ra_insert" ON recoverable_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "ra_update" ON recoverable_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "ra_delete" ON recoverable_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── updated_at triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_rib_updated_at BEFORE UPDATE ON recoverable_import_batches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_ra_updated_at BEFORE UPDATE ON recoverable_allocations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

---

## 4. Folder Structure

```
app/(app)/recoverables/
  page.tsx                          ← Dashboard (server)
  loading.tsx
  import/
    page.tsx                        ← CSV upload (server shell)
  batches/
    [id]/
      page.tsx                      ← Batch detail (server)
      loading.tsx
  suppliers/
    [name]/
      page.tsx                      ← Supplier ledger (server)

components/recoverables/
  dashboard/
    RecoverablesDashboardClient.tsx ← Main dashboard client
    StatsRow.tsx                    ← Totals summary cards
    BatchList.tsx                   ← Recent import batches
    SupplierBalances.tsx            ← Pending recoverables by supplier
  import/
    CSVDropzone.tsx                 ← Drag/drop + file picker
    CSVPreviewTable.tsx             ← Preview parsed rows before save
    ValidationErrors.tsx            ← Per-row error display
    SupplierColumnBadges.tsx        ← Show detected supplier columns
  batch/
    BatchDetailClient.tsx           ← Full batch view + allocations
    AllocationTable.tsx             ← All supplier allocations in batch
    ShipmentRow.tsx                 ← Collapsible shipment detail
  supplier/
    SupplierLedgerClient.tsx        ← Supplier recoverables ledger
    AllocationRow.tsx               ← Single allocation row
    BalanceSummary.tsx              ← Pending / billed / paid totals

lib/recoverables/
  types.ts                          ← All TypeScript types
  csv/
    parser.ts                       ← CSV text → raw rows
    validator.ts                    ← Validation rules + error messages
    transformer.ts                  ← Wide CSV → normalized allocations
  engine/
    allocation.ts                   ← Per-piece cost + proportional split
    balance.ts                      ← Aggregate supplier balances
  ocr/                              ← STUB ONLY — do not implement
    types.ts
    pipeline.ts

app/api/recoverables/
  import/
    route.ts                        ← POST: parse + process + store CSV
  batches/
    [id]/
      route.ts                      ← GET, DELETE
  allocations/
    [id]/
      route.ts                      ← PATCH (mark billed/paid)
  suppliers/
    [name]/
      route.ts                      ← GET supplier ledger data
```

---

## 5. CSV Parsing Architecture

### Input format (wide / human-friendly)
```csv
AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D
2895949593,3698.25,11,1,3,7,0
2895949594,1200.00,4,2,2,0,0
```

### Detection logic (`lib/recoverables/csv/parser.ts`)
1. Parse header row
2. Identify fixed columns: `AWB` (or `Reference`), `Total Cost`, `Total PCS`
3. Everything else = supplier columns (auto-detected, order preserved)
4. Parse data rows → `RawCSVRow[]`

### Validation rules (`lib/recoverables/csv/validator.ts`)
- Reference must be non-empty
- Total Cost must be a positive number
- Total PCS must equal sum of supplier columns
- No supplier column can be negative
- At least one supplier column must be > 0

### Transformation (`lib/recoverables/csv/transformer.ts`)
Wide row → `ParsedShipment` with `allocations[]` per supplier (where pieces > 0)

---

## 6. Allocation Engine Architecture

### `lib/recoverables/engine/allocation.ts`

```typescript
// Per-piece cost
perPieceCost = totalCost / totalPieces  (rounded to 4dp)

// Per supplier
baseCost = pieces × perPieceCost  (rounded to 2dp)
markupAmount = markup calculation
recoverableAmount = baseCost + markupAmount
```

**Rounding rule**: Use banker's rounding. Sum of allocations must equal total cost — distribute rounding difference to the largest allocation.

### `lib/recoverables/engine/balance.ts`
Aggregates `recoverable_allocations` by `supplier_name` + `status` to produce:
```typescript
interface SupplierBalance {
  supplierName: string
  customerId: string | null
  pendingAmount: number
  billedAmount: number
  paidAmount: number
  totalAmount: number
  allocationCount: number
  lastActivity: string
}
```

---

## 7. Processing Engine Architecture

### `app/api/recoverables/import/route.ts` (POST)

```
1. Auth check
2. Parse multipart form: get CSV file + metadata (name, source, currency, date)
3. Upload CSV to storage: recoverables/imports/{userId}/{timestamp}-{name}.csv
4. Run parser → RawCSVRow[]
5. Run validator → ValidationResult { valid: boolean; errors: RowError[] }
6. If preview=true: return { valid, errors, preview: rows } without DB writes
7. If valid && !preview:
   a. Insert import_batch row
   b. Insert shipment rows
   c. Insert allocation rows
   d. Update batch summary fields (row_count, total_cost, etc.)
8. Return { batchId, summary }
```

---

## 8. Dashboard Architecture

### `/recoverables` page
Three sections:
1. **Stats row**: Total pending, total billed, total paid, batch count
2. **Supplier balances**: Top suppliers by pending amount (card grid)
3. **Recent batches**: Last 10 imports with status + amounts

### Supplier ledger `/recoverables/suppliers/[name]`
- Header: supplier name, total pending, linked customer (if matched)
- Allocation table: all pending allocations grouped by batch
  - Reference | Batch | Date | PCS | Amount | Status | Actions
- Filter tabs: All / Pending / Billed / Paid

---

## 9. Future OCR Architecture (Stub Only)

Create stub files — do NOT implement:

### `lib/recoverables/ocr/types.ts`
```typescript
export interface OCRExtractionResult {
  references: string[]
  costs: Record<string, number>
  confidence: number
  rawText: string
  parseMethod: 'regex' | 'ai'
}

export interface OCRPipelineOptions {
  provider: string
  filePath: string
  fileType: 'pdf' | 'image'
}
```

### `lib/recoverables/ocr/pipeline.ts`
```typescript
// TODO: implement DHL PDF parsing
// Will extract AWB numbers and charges from courier invoice PDFs
// Output: auto-populated CSV draft for user review
export async function extractFromPDF(options: OCRPipelineOptions): Promise<OCRExtractionResult> {
  throw new Error('OCR pipeline not yet implemented')
}
```

---

## 10. TypeScript Core Types

### `lib/recoverables/types.ts`

```typescript
// ── DB row types ────────────────────────────────────────────

export type BatchStatus = 'pending' | 'processed' | 'failed'
export type AllocationStatus = 'pending' | 'billed' | 'paid' | 'cancelled'
export type MarkupType = 'percentage' | 'flat' | 'none'

export interface ImportBatch {
  id: string
  user_id: string
  name: string
  source: string | null
  import_date: string
  currency: string
  csv_path: string | null
  row_count: number
  reference_count: number
  supplier_count: number
  total_cost: number
  total_recoverable: number
  status: BatchStatus
  validation_errors: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecoverableShipment {
  id: string
  user_id: string
  batch_id: string
  reference: string
  total_cost: number
  total_pieces: number
  per_piece_cost: number
  source: string | null
  shipment_date: string | null
  destination: string | null
  weight_kg: number | null
  raw_row: Record<string, unknown> | null
  created_at: string
}

export interface RecoverableAllocation {
  id: string
  user_id: string
  batch_id: string
  shipment_id: string
  customer_id: string | null
  supplier_name: string
  pieces: number
  base_cost: number
  markup_type: MarkupType
  markup_value: number
  markup_amount: number
  recoverable_amount: number
  status: AllocationStatus
  billed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── CSV parsing types ────────────────────────────────────────

export interface RawCSVRow {
  rowIndex: number
  reference: string
  totalCost: number
  totalPcs: number
  suppliers: Record<string, number>  // supplierName → pieces
  raw: Record<string, string>        // original values for error display
}

export interface RowValidationError {
  rowIndex: number
  reference: string
  field: string
  message: string
}

export interface CSVParseResult {
  supplierColumns: string[]
  rows: RawCSVRow[]
  errors: RowValidationError[]
  isValid: boolean
}

// ── Engine types ─────────────────────────────────────────────

export interface ParsedAllocation {
  supplierName: string
  pieces: number
  baseCost: number
  markupType: MarkupType
  markupValue: number
  markupAmount: number
  recoverableAmount: number
}

export interface ParsedShipment {
  reference: string
  totalCost: number
  totalPieces: number
  perPieceCost: number
  allocations: ParsedAllocation[]
}

export interface ProcessingResult {
  batchId: string
  referenceCount: number
  supplierCount: number
  allocationCount: number
  totalCost: number
  totalRecoverable: number
  errors: string[]
}

// ── Dashboard types ──────────────────────────────────────────

export interface SupplierBalance {
  supplierName: string
  customerId: string | null
  pendingAmount: number
  billedAmount: number
  paidAmount: number
  totalAmount: number
  allocationCount: number
  lastActivity: string | null
}

export interface DashboardStats {
  totalPending: number
  totalBilled: number
  totalPaid: number
  batchCount: number
  supplierCount: number
  currency: string
}
```

---

---
# CLAUDE CODE PROMPTS
---

## PROMPT 1 — Safe Old Logistics Module Removal

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Safely remove the old logistics/courier module and wire up the new "Recoverables" nav item.

SAFETY RULES — read before doing anything:
- Do NOT touch: accounts, transactions, categories, auth, dashboard, bills, budgets,
  subscriptions, customers, insights, settings, currencies, or any shared component.
- Do NOT delete: lib/supabase/, lib/utils.ts, lib/types.ts, components/shared/,
  components/AppShell.tsx (edit only), app/globals.css, tailwind.config.ts
- Do NOT drop database tables or delete migration SQL files.
  Only rename migration files to add a .deprecated suffix so they're clearly archived:
  supabase/migration_v8_logistics.sql       → supabase/migration_v8_logistics.sql.deprecated
  supabase/migration_v8b_analytics_view.sql → supabase/migration_v8b_analytics_view.sql.deprecated
  supabase/migration_v8c_gst.sql            → supabase/migration_v8c_gst.sql.deprecated
  supabase/migration_v8d_rls_fix.sql        → supabase/migration_v8d_rls_fix.sql.deprecated

STEP 1 — Delete logistics-specific files:
Delete these entire directories (confirm each exists before deleting):
  app/(app)/logistics/
  components/logistics/
  lib/logistics/
  app/api/logistics/

STEP 2 — Update AppShell.tsx:
File: components/AppShell.tsx
- Remove the import of Package from lucide-react (if no longer used elsewhere)
- Remove the nav item: { href: '/logistics', label: 'Logistics', icon: Package }
- Add import: ArrowDownUp from 'lucide-react'
- Add nav item (insert where Logistics was): { href: '/recoverables', label: 'Recoverables', icon: ArrowDownUp }

STEP 3 — Create stub route so the app doesn't 404:
Create app/(app)/recoverables/page.tsx with this content:
  export default function RecoverablesPage() {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p style={{ color: 'var(--text-muted)' }}>Recoverables module coming soon.</p>
      </div>
    )
  }

STEP 4 — Verify:
Run: npx tsc --noEmit
Fix any TypeScript errors caused by the deletions (likely broken imports).
Then run: npm run build
Confirm clean build. Report any remaining errors.

IMPORTANT: If any deleted file is imported somewhere outside the logistics module,
do NOT delete it — move it to a /tmp-review/ folder instead and report it.
```

---

## PROMPT 2 — Recoverables Database Schema + Types

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Create the Recoverables database migration and all TypeScript types.

STEP 1 — Create the migration file:
Create: supabase/migration_v9_recoverables.sql

Content: (copy exactly from RECOVERABLES_BUILD_PLAN.md section "3. Database Schema")

Key tables to create:
  recoverable_import_batches
  recoverable_shipments        (with GENERATED per_piece_cost column)
  recoverable_allocations

Requirements:
- All tables: UUID primary keys, user_id FK to auth.users ON DELETE CASCADE
- RLS: USE SEPARATE SELECT/INSERT/UPDATE/DELETE policies (NOT FOR ALL — it has a bug)
- GRANT ALL ON each table TO authenticated
- Use DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$ for policies
  so the migration is idempotent
- Add updated_at triggers for import_batches and allocations

STEP 2 — Create TypeScript types:
Create: lib/recoverables/types.ts

Include all types from section "10. TypeScript Core Types" in RECOVERABLES_BUILD_PLAN.md:
  BatchStatus, AllocationStatus, MarkupType
  ImportBatch, RecoverableShipment, RecoverableAllocation
  RawCSVRow, RowValidationError, CSVParseResult
  ParsedAllocation, ParsedShipment, ProcessingResult
  SupplierBalance, DashboardStats

STEP 3 — Create OCR stub files:
Create: lib/recoverables/ocr/types.ts
Create: lib/recoverables/ocr/pipeline.ts
(Stub only — see section 9 of build plan. Functions should throw 'not yet implemented')

STEP 4 — Create lib/supabase/admin.ts (if it doesn't already exist):
  import { createClient } from '@supabase/supabase-js'
  export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }

STEP 5 — Add SUPABASE_SERVICE_ROLE_KEY to .env.local.example if not present.

STEP 6 — Print the migration SQL to console so user can run it in Supabase SQL Editor.
Tell the user: "Run supabase/migration_v9_recoverables.sql in your Supabase SQL Editor."

STEP 7 — Run: npx tsc --noEmit
Fix any TypeScript errors. Report clean.
```

---

## PROMPT 3 — CSV Parser + Validator

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Build the CSV parsing and validation library for the Recoverables module.
This is pure TypeScript — no UI, no database writes yet.

── CSV FORMAT ──
Header row example:
  AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D

Data row example:
  2895949593,3698.25,11,1,3,7,0

Rules:
- First column: reference identifier (header may be "AWB", "Reference", "Ref", "ID" — case insensitive)
- Second column: total cost (header may be "Total Cost", "Cost", "Amount", "Total Amount")
- Third column: total PCS (header may be "Total PCS", "PCS", "Total Pieces", "Pieces")
- All remaining columns: supplier columns (names taken from header row exactly)
- Supplier columns with value 0 should be included in parse but excluded from allocations

── STEP 1: Create lib/recoverables/csv/parser.ts ──

Export these functions:

  detectColumns(headers: string[]): {
    referenceCol: number
    totalCostCol: number
    totalPcsCol: number
    supplierCols: Array<{ name: string; index: number }>
    errors: string[]
  }
  // Uses case-insensitive matching for fixed columns.
  // Any column NOT identified as reference/cost/pcs is treated as a supplier column.
  // Returns errors if reference/cost/pcs columns cannot be identified.

  parseCSVText(csvText: string): RawCSVRow[]
  // Parses CSV text into raw rows.
  // Handles: quoted fields, Windows line endings, trailing commas.
  // Uses detectColumns internally.
  // Skips empty rows.
  // Preserves original string values in raw field for error display.

── STEP 2: Create lib/recoverables/csv/validator.ts ──

Export:
  validateRows(rows: RawCSVRow[], supplierColumns: string[]): {
    validRows: RawCSVRow[]
    errors: RowValidationError[]
    isValid: boolean
  }

Validation rules (check each, collect all errors per row):
  1. reference must be non-empty string
  2. totalCost must be a positive finite number
  3. totalPcs must be a positive integer > 0
  4. Each supplier piece count must be a non-negative integer
  5. Sum of supplier pieces must equal totalPcs (within rounding tolerance of 0)
  6. At least one supplier must have pieces > 0
  7. totalCost must be > 0

Error messages should be human-readable, e.g.:
  "Row 3: Total PCS (11) does not match sum of supplier pieces (9). Check Supplier A + Supplier B + Supplier C."

── STEP 3: Create lib/recoverables/csv/transformer.ts ──

Export:
  transformToShipments(validRows: RawCSVRow[], currency: string): ParsedShipment[]
  // For each row:
  //   perPieceCost = round(totalCost / totalPcs, 4)
  //   For each supplier with pieces > 0:
  //     baseCost = round(pieces × perPieceCost, 4)
  //   Apply rounding correction to largest allocation so sum = totalCost exactly
  //   Return ParsedShipment with allocations[] (only suppliers with pieces > 0)

  summarize(shipments: ParsedShipment[]): {
    referenceCount: number
    supplierCount: number
    totalCost: number
    totalRecoverable: number
    supplierNames: string[]
  }

── STEP 4: Write unit tests ──
Create lib/recoverables/csv/__tests__/parser.test.ts
Test cases:
  1. Parses valid 4-supplier CSV correctly
  2. Detects supplier columns with varied header names
  3. Handles zero-piece suppliers (excludes from allocations)
  4. Returns error when PCS sum doesn't match Total PCS
  5. Handles quoted fields with commas
  6. Rounding: allocations sum exactly equals total cost
  7. Empty rows are skipped

Use Vitest or Jest (match existing test setup — check package.json).
If no test setup exists, add vitest to devDependencies and create vitest.config.ts.

── STEP 5 ──
Run: npx tsc --noEmit
Fix any TypeScript errors. Report clean.
```

---

## PROMPT 4 — CSV Upload UI + Import API Route

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Build the CSV upload UI and the import API route.
Imports from lib/recoverables/csv/* must be complete before running this prompt.

── STEP 1: Create app/api/recoverables/import/route.ts ──

POST handler:
  Body: FormData with fields:
    file: File (CSV)
    name: string (batch name, e.g. "DHL May Week 2")
    source: string (optional, e.g. "DHL")
    currency: string (default 'INR')
    importDate: string (YYYY-MM-DD, default today)
    preview: 'true' | 'false'  (if true: parse+validate but don't write DB)

  Flow:
    1. Auth check (return 401 if not authenticated)
    2. Read CSV file from FormData
    3. Run parseCSVText() → RawCSVRow[]
    4. Run validateRows() → { validRows, errors, isValid }
    5. If preview=true OR !isValid:
       Return { preview: true, isValid, errors, rows: validRows.slice(0,50), supplierColumns, summary }
       (50-row preview limit)
    6. If isValid and preview=false:
       a. Upload CSV to Supabase Storage: recoverables/imports/{userId}/{Date.now()}-{name}.csv
       b. Run transformToShipments() → ParsedShipment[]
       c. Insert import_batch row (status='pending')
       d. Batch insert shipments (use .insert(rows) in chunks of 100)
       e. Batch insert allocations (use .insert(rows) in chunks of 200)
       f. Update import_batch: set status='processed', counts, totals
       g. Return { success: true, batchId, summary }
    7. On any error: mark batch as 'failed' if batch row was created, return 500

  Use createAdminClient() from lib/supabase/admin.ts for all DB writes (bypasses RLS).
  Use createClient() from lib/supabase/server.ts only for auth.getUser().

── STEP 2: Create components/recoverables/import/CSVDropzone.tsx ──

'use client' component.

Props: { onFileSelect: (file: File) => void; isLoading?: boolean }

UI:
  - Large dashed border drop zone (full width, ~180px tall on mobile)
  - Icon: Upload or FileSpreadsheet from lucide-react
  - Text: "Drop your CSV here or tap to browse"
  - Sub-text: "Export from Apple Numbers or Excel as CSV"
  - Accept: .csv only
  - Touch-friendly: large tap target
  - Drag-over state: highlight with var(--brand) border + var(--brand-light) background
  - Loading state: show spinner, disable interaction

Use HTML5 drag events + input[type=file]. No third-party drag library.

── STEP 3: Create components/recoverables/import/SupplierColumnBadges.tsx ──

Props: { suppliers: string[] }
Shows detected supplier names as small pill badges in var(--brand-light) color.
Prefix text: "Detected suppliers:"

── STEP 4: Create components/recoverables/import/ValidationErrors.tsx ──

Props: { errors: RowValidationError[]; maxShow?: number }
Shows first maxShow (default 5) errors as a red-tinted list.
Each error: "Row {rowIndex}: {message}"
If more errors than maxShow: "...and {n} more errors"

── STEP 5: Create components/recoverables/import/CSVPreviewTable.tsx ──

Props: { rows: RawCSVRow[]; supplierColumns: string[]; errors: RowValidationError[] }

A horizontal-scroll table showing:
  Columns: Reference | Total Cost | Total PCS | {supplier columns...}
  Rows with errors: highlighted with var(--expense) left border
  Max 20 rows shown

Style: compact (py-2 rows), font-mono for reference numbers,
right-aligned numbers, sticky first column.

── STEP 6: Create app/(app)/recoverables/import/page.tsx ──

Server component shell. Render a client component ImportPageClient.

── STEP 7: Create a client component for the full import page ──
(Can live in components/recoverables/import/ or inline in the page)

State machine:
  idle → file_selected → previewing → ready_to_import | has_errors → importing → done

UI flow:
  1. IDLE: Show CSVDropzone
  2. FILE SELECTED: Call preview API, show spinner
  3. PREVIEWING:
     - Show SupplierColumnBadges (detected suppliers)
     - Show CSVPreviewTable (first 20 rows)
     - If errors: show ValidationErrors + "Fix your CSV and re-upload" (disable import button)
     - If valid: show summary stats (X references, Y suppliers, ₹Z total)
     - Show "Import" button (brand color) + "Cancel" button
  4. IMPORTING: Progress indicator
  5. DONE: Success state + "View Batch" link → /recoverables/batches/{batchId}

Batch name field: text input, auto-populated from filename, editable.
Source field: optional text input (e.g. "DHL", "FedEx").
Currency: select, default INR.

── STEP 8 ──
Run: npx tsc --noEmit
Fix any TypeScript errors. Run: npm run build. Report clean.
```

---

## PROMPT 5 — Allocation Processing Engine

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Build the core allocation calculation engine for the Recoverables module.

── STEP 1: Create lib/recoverables/engine/allocation.ts ──

This module is pure TypeScript — no database, no side effects.
All calculations must be deterministic and auditable.

Export these functions:

  calcPerPieceCost(totalCost: number, totalPieces: number): number
  // Returns totalCost / totalPieces rounded to 4 decimal places.
  // Throws if totalPieces === 0.

  calcBaseCost(pieces: number, perPieceCost: number): number
  // Returns pieces × perPieceCost, rounded to 4dp.

  applyMarkup(
    baseCost: number,
    markupType: MarkupType,
    markupValue: number
  ): { markupAmount: number; total: number }
  // percentage: markupAmount = round(baseCost × markupValue / 100, 2)
  // flat:       markupAmount = markupValue
  // none:       markupAmount = 0
  // total = round(baseCost + markupAmount, 2)

  distributeRoundingDiff(
    allocations: Array<{ pieces: number; baseCost: number }>,
    totalCost: number
  ): Array<{ pieces: number; baseCost: number }>
  // After calculating baseCost for each allocation, sum may differ from totalCost by ±0.01
  // due to floating-point rounding. Add/subtract the difference to/from the allocation
  // with the most pieces (largest allocation). This ensures sum === totalCost exactly.

  processShipment(
    reference: string,
    totalCost: number,
    suppliers: Record<string, number>,  // supplierName → pieces
    markupRules?: Record<string, { markupType: MarkupType; markupValue: number }>
  ): ParsedShipment
  // Full calculation for one shipment row. Calls the above in sequence.
  // Only includes suppliers with pieces > 0.
  // Applies markupRules[supplierName] if provided, else uses 'none'.

── STEP 2: Create lib/recoverables/engine/balance.ts ──

Export:
  aggregateSupplierBalances(
    allocations: RecoverableAllocation[]
  ): SupplierBalance[]
  // Groups allocations by supplier_name.
  // Sums recoverable_amount by status bucket (pending / billed / paid).
  // Sorts by pendingAmount descending.

  calcDashboardStats(
    batches: ImportBatch[],
    allocations: RecoverableAllocation[],
    currency: string
  ): DashboardStats
  // Aggregates totals for the dashboard stats row.

── STEP 3: Write unit tests ──
Create lib/recoverables/engine/__tests__/allocation.test.ts

Test cases:
  1. Basic: ₹3698.25 / 11 PCS → perPieceCost = ₹336.2045
  2. Allocation: Supplier A (1 PCS) = ₹336.20, Supplier B (3 PCS) = ₹1008.61, Supplier C (7 PCS) = ₹2353.43
  3. Rounding check: sum of all allocations === ₹3698.25 (no rounding loss)
  4. Markup percentage: 10% on ₹336.20 = ₹33.62 markup, total ₹369.82
  5. Markup flat: ₹50 flat on any base → markupAmount = 50
  6. Zero pieces supplier: excluded from allocations
  7. Throws on zero totalPieces

── STEP 4 ──
Run: npx tsc --noEmit
Fix TypeScript errors. Run tests. Report all passing.
```

---

## PROMPT 6 — Recoverables Dashboard

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Build the Recoverables main dashboard at /recoverables.
The database tables and types from Prompt 2 must be in place.

Design philosophy: Linear/Ramp/Notion aesthetic.
- Clean, spacious, card-based
- Mobile-first
- No forms on this page — it's a read-only operations view
- Use existing CSS variables (var(--surface), var(--brand), etc.)

── STEP 1: Create app/(app)/recoverables/page.tsx ──

Server component. Fetches all data server-side using createClient() from lib/supabase/server.ts.

Data to fetch (all filtered by user_id):
  - Last 20 import batches ordered by created_at DESC
  - All pending recoverable_allocations (status='pending') for balance calculation
  - Dashboard stats: sum totals from allocations

Pass all data as props to RecoverablesDashboardClient.

── STEP 2: Create app/(app)/recoverables/loading.tsx ──
Simple skeleton loading state matching the dashboard layout.
Use .skeleton CSS class from globals.css.

── STEP 3: Create components/recoverables/dashboard/StatsRow.tsx ──

Props:
  stats: DashboardStats

Shows 4 stat cards in a 2×2 grid (mobile) / 4-column row (md+):
  - Total Pending  (highlight: var(--brand))
  - Total Billed
  - Total Paid     (highlight: var(--income))
  - Active Batches

Each card:
  - Large number (text-display class)
  - Label below (text-label class)
  - Currency prefix where applicable

── STEP 4: Create components/recoverables/dashboard/SupplierBalances.tsx ──

Props:
  balances: SupplierBalance[]
  currency: string

Shows top suppliers by pending amount.
Each supplier row:
  - Supplier name (font-semibold)
  - Pending amount (right aligned, var(--brand) color)
  - Small progress bar: pending / total
  - Count of pending allocations
  - Tap → navigates to /recoverables/suppliers/[encodedName]

If no pending balances: empty state with icon + "All caught up"

── STEP 5: Create components/recoverables/dashboard/BatchList.tsx ──

Props:
  batches: ImportBatch[]

Shows recent import batches as a card list.
Each batch row:
  - Batch name + source badge (e.g. "DHL")
  - Date (relative: "3 days ago" using date-fns or manual calculation)
  - Row count + supplier count
  - Total cost amount
  - Status badge: pending (yellow) / processed (green) / failed (red)
  - Tap → navigates to /recoverables/batches/[id]

If no batches: empty state:
  - Icon (UploadCloud from lucide-react)
  - "No imports yet"
  - "Import your first CSV" button → /recoverables/import

── STEP 6: Create components/recoverables/dashboard/RecoverablesDashboardClient.tsx ──

'use client' component.
Props: { stats: DashboardStats; batches: ImportBatch[]; balances: SupplierBalance[]; currency: string }

Layout:
  - Page header: "Recoverables" title + "Import CSV" button (top right) → /recoverables/import
  - StatsRow
  - Section: "Pending by Supplier" → SupplierBalances
  - Section: "Recent Imports" → BatchList

── STEP 7 ──
Run: npx tsc --noEmit
Fix TypeScript errors. Run: npm run build. Report clean.
```

---

## PROMPT 7 — Batch Detail + Supplier Ledger

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Build the batch detail view and supplier recoverables ledger.

── STEP 1: Create app/(app)/recoverables/batches/[id]/page.tsx ──

Server component.
Fetch from Supabase:
  - import_batch by id (verify user_id ownership → notFound() if missing)
  - All shipments for this batch
  - All allocations for this batch (join supplier_name, pieces, recoverable_amount, status)

Pass to BatchDetailClient.

── STEP 2: Create app/(app)/recoverables/batches/[id]/loading.tsx ──
Skeleton state.

── STEP 3: Create components/recoverables/batch/BatchDetailClient.tsx ──

'use client' component.
Props: { batch: ImportBatch; shipments: RecoverableShipment[]; allocations: RecoverableAllocation[] }

Layout:
  Section 1 — Batch header card:
    - Batch name + source badge
    - Import date
    - Status badge
    - Stats: references | suppliers | total cost | total recoverable
    - Delete button (with confirm modal) → calls DELETE /api/recoverables/batches/[id]

  Section 2 — Supplier summary table (grouped):
    - Group allocations by supplier_name
    - Columns: Supplier | PCS | Base Cost | Recoverable | Status | Actions
    - "Mark Billed" button per row → calls PATCH /api/recoverables/allocations/[id]

  Section 3 — Shipment breakdown (collapsible list):
    - Each shipment shows reference, total cost, per-piece cost
    - Expandable: shows allocation rows within that shipment

── STEP 4: Create app/api/recoverables/batches/[id]/route.ts ──

DELETE handler:
  1. Auth check
  2. Verify batch belongs to user (use regular client for SELECT)
  3. Use admin client to delete batch (cascades to shipments + allocations)
  4. Return { success: true }

── STEP 5: Create app/api/recoverables/allocations/[id]/route.ts ──

PATCH handler:
  Body: { status: AllocationStatus; notes?: string }
  1. Auth check
  2. Verify allocation belongs to user
  3. Update status, set billed_at if status='billed'
  4. Return updated allocation

── STEP 6: Create app/(app)/recoverables/suppliers/[name]/page.tsx ──

Server component.
  - Decode supplier name from URL params (decodeURIComponent)
  - Fetch all allocations for this user + supplier_name
  - Fetch matching customer from customers table (case-insensitive name match, best effort)
  - Group by batch

Pass to SupplierLedgerClient.

── STEP 7: Create components/recoverables/supplier/SupplierLedgerClient.tsx ──

'use client' component.
Props: { supplierName: string; allocations: RecoverableAllocation[]; customer: Customer | null; batches: ImportBatch[] }

Layout:
  Header:
    - Supplier name (large, bold)
    - If customer matched: show customer badge (linked to /customers/[id])
    - Balance summary: Pending | Billed | Paid

  Filter tabs: All | Pending | Billed | Paid

  Allocations table (filtered by active tab):
    Columns: Reference | Batch | Date | PCS | Amount | Status | Mark Billed
    - Reference: AWB/job code
    - Batch: batch name (link to batch detail)
    - Status badge
    - "Mark Billed" button (inline, for pending rows) → PATCH API call → optimistic update

  Empty state per tab if no allocations.

── STEP 8: Create app/api/recoverables/suppliers/[name]/route.ts ──

GET handler:
  Returns all allocations for the authenticated user where supplier_name = decoded [name]
  Includes joined batch info (batch name, import_date)

── STEP 9 ──
Run: npx tsc --noEmit
Fix TypeScript errors. Run: npm run build. Report clean.
```

---

## PROMPT 8 — Mobile Polish + Final Integration

```
You are working on a live Next.js 15 / Supabase / TypeScript app called Vaultr.
Working directory: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

TASK: Final polish pass on the Recoverables module for mobile-first production quality.
All previous Recoverables prompts must be complete before running this.

── STEP 1 — Audit all recoverables components ──

Read every file in:
  components/recoverables/**
  app/(app)/recoverables/**

Check each for:
  a) Missing loading states (add Loader2 spinners for async actions)
  b) Missing error states (show toast on API errors using useToast from components/shared/Toast)
  c) Empty states (every list needs a meaningful empty state with icon + message)
  d) Mobile layout issues (check all tables have horizontal scroll, all touch targets ≥ 44px)
  e) Missing page-enter animation (add className="page-enter" to top-level div of each page)
  f) Inconsistent card styling (all cards should use className="card" from globals.css)
  g) Color consistency (all text uses var(--text), muted uses var(--text-muted))

── STEP 2 — Fix AllocationTable mobile layout ──

The AllocationTable in BatchDetailClient is a wide table.
On mobile (< md):
  Replace table with card-list layout:
  Each supplier = one card showing: name / PCS / amount / status / action button
  Table layout only on md+ screens.

── STEP 3 — Add import CSV button to mobile ──

In RecoverablesDashboardClient:
  Add a floating action button (FAB) on mobile:
  - Position: fixed bottom-right (same position as the main app FAB pattern)
  - Icon: Upload from lucide-react
  - Links to /recoverables/import
  - Only show on md: hidden (desktop has the header button)

── STEP 4 — Add back-navigation to all pages ──

Every recoverables sub-page should have a back button in the header:
  <button onClick={() => router.back()}>
    <ChevronLeft className="w-5 h-5" />
  </button>

Pages needing this: import page, batch detail, supplier ledger.

── STEP 5 — Ensure consistent status badge component ──

Create components/recoverables/shared/StatusBadge.tsx:
  Props: { status: AllocationStatus | BatchStatus }
  Returns a styled <span> using the existing CSS variable pattern:
    pending   → var(--status-pending-bg) / var(--status-pending-text)
    processed / paid → var(--status-paid-bg) / var(--status-paid-text)
    billed    → var(--status-partial-bg) / var(--status-partial-text)
    failed / cancelled → var(--status-cancelled-bg) / var(--status-cancelled-text)

Replace any inline status styling across all recoverables components with this badge.

── STEP 6 — Confirm nav highlight works ──

In components/AppShell.tsx:
  Verify the active nav item highlight logic works for /recoverables/* paths.
  The active check should use: pathname.startsWith(item.href) for multi-segment paths.

── STEP 7 — Final build ──

Run: npx tsc --noEmit
Fix all TypeScript errors.
Run: npm run build
Confirm clean build with no errors or warnings.
Report: list of all files created/modified in this entire phase.
```

---

## Run Order

| # | Prompt | Prerequisite |
|---|--------|-------------|
| 1 | Safe old logistics removal | None |
| 2 | Database schema + types | Prompt 1 |
| 3 | CSV parser + validator | Prompt 2 |
| 4 | CSV upload UI + API route | Prompts 2 + 3 |
| 5 | Allocation engine | Prompts 2 + 3 |
| 6 | Recoverables dashboard | Prompts 2 + 5 |
| 7 | Batch detail + supplier ledger | Prompts 4 + 5 + 6 |
| 8 | Mobile polish + final integration | All previous |

---

## What's Deferred (Future Phases)

| Feature | When |
|---------|------|
| PDF invoice generation | Phase 2 |
| Invoice numbering + sending | Phase 2 |
| DHL PDF / OCR parsing | Phase 3 |
| AI-assisted CSV validation | Phase 3 |
| Email delivery | Phase 2 |
| Markup rules UI | Phase 2 |
| Export to CSV / Excel | Phase 2 |
