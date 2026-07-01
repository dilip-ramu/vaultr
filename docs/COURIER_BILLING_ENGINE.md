# Vaultr — Courier Allocation & Supplier Billing Engine
## Architecture Design, Schema & Implementation Prompts

---

## 1. ARCHITECTURE OVERVIEW

### How This Fits Into Vaultr

```
Existing Vaultr
├── accounts          ← reused (courier payment accounts)
├── customers         ← reused (suppliers/customers = same table)
├── bills             ← reused (generated supplier invoices feed into bills)
├── attachments       ← reused (courier PDF/Excel storage)
└── transactions      ← reused (recording courier payments)

New Module: /logistics
├── courier_invoices      ← master DHL/FedEx invoice
│   └── awbs              ← individual shipments on that invoice
│       └── awb_allocations   ← supplier piece splits per AWB
│           └── markup_rules  ← supplier-specific pricing rules
└── supplier_invoices     ← generated output invoices
    └── supplier_invoice_lines ← line items (one per AWB allocation)
```

### Data Flow

```
1. Upload DHL PDF/Excel
        ↓
2. Create courier_invoice record
        ↓
3. Add AWB records (manually or future OCR)
        ↓
4. For each AWB: add supplier allocations (PCS counts)
        ↓
5. Engine calculates: per-piece cost = AWB total ÷ total PCS
        ↓
6. Apply markup rules per supplier
        ↓
7. Generate supplier_invoice with line items
        ↓
8. Export branded PDF
        ↓
9. Mark as paid → creates transaction in accounts
```

---

## 2. DATABASE SCHEMA

### Table: `courier_invoices`
Master invoice received from DHL/FedEx/Aramex.

```sql
CREATE TABLE courier_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id      UUID REFERENCES households(id),

  -- Courier identity
  courier_provider  TEXT NOT NULL,           -- 'DHL' | 'FedEx' | 'Aramex' | 'UPS' | 'custom'
  invoice_number    TEXT NOT NULL,
  invoice_date      DATE NOT NULL,
  due_date          DATE,
  currency          TEXT NOT NULL DEFAULT 'INR',

  -- Financials
  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','paid','cancelled')),
  paid_at           TIMESTAMPTZ,
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- File
  file_path         TEXT,                    -- Supabase storage path
  file_name         TEXT,
  file_type         TEXT,                    -- 'pdf' | 'excel' | 'manual'

  -- OCR pipeline (future)
  ocr_status        TEXT DEFAULT 'none'
                    CHECK (ocr_status IN ('none','queued','processing','done','failed')),
  ocr_raw_data      JSONB,                   -- raw extracted JSON for future AI use
  ocr_confidence    DECIMAL(5,2),

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `awbs`
Individual shipments inside a courier invoice. Each AWB is an independent allocation pool.

```sql
CREATE TABLE awbs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  courier_invoice_id  UUID NOT NULL REFERENCES courier_invoices(id) ON DELETE CASCADE,

  -- AWB identity
  awb_number          TEXT NOT NULL,
  shipment_date       DATE,
  destination_country TEXT,
  destination_city    TEXT,
  receiver_name       TEXT,
  receiver_reference  TEXT,

  -- Weight
  actual_weight       DECIMAL(10,3),
  volumetric_weight   DECIMAL(10,3),
  chargeable_weight   DECIMAL(10,3),
  weight_unit         TEXT DEFAULT 'KG',

  -- Charges (each line from DHL invoice)
  shipment_charge     DECIMAL(15,2) NOT NULL DEFAULT 0,
  fuel_surcharge      DECIMAL(15,2) NOT NULL DEFAULT 0,
  demand_surcharge    DECIMAL(15,2) NOT NULL DEFAULT 0,
  gogreen_surcharge   DECIMAL(15,2) NOT NULL DEFAULT 0,
  remote_area_charge  DECIMAL(15,2) NOT NULL DEFAULT 0,
  other_charges       DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount          DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_charge        DECIMAL(15,2) GENERATED ALWAYS AS (
    shipment_charge + fuel_surcharge + demand_surcharge +
    gogreen_surcharge + remote_area_charge + other_charges + tax_amount
  ) STORED,

  -- Allocation summary (computed, updated by trigger)
  total_pieces        INT NOT NULL DEFAULT 0,
  allocated_pieces    INT NOT NULL DEFAULT 0,
  per_piece_base_cost DECIMAL(15,4),        -- total_charge / total_pieces

  -- Service info
  service_type        TEXT,                 -- 'EXPRESS' | 'ECONOMY' | etc.
  product_code        TEXT,

  -- OCR-ready metadata
  raw_line_data       JSONB,               -- original parsed line from invoice

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(courier_invoice_id, awb_number)
);
```

### Table: `awb_allocations`
Supplier/customer piece allocations for a single AWB.

```sql
CREATE TABLE awb_allocations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  awb_id                UUID NOT NULL REFERENCES awbs(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Allocation
  pieces                INT NOT NULL DEFAULT 1 CHECK (pieces > 0),
  weight_kg             DECIMAL(10,3),      -- optional weight override

  -- Cost calculation (computed by engine, stored for audit)
  base_cost             DECIMAL(15,2),      -- pieces × per_piece_base_cost
  markup_type           TEXT DEFAULT 'percentage'
                        CHECK (markup_type IN ('percentage','flat','none')),
  markup_value          DECIMAL(10,4) DEFAULT 0,  -- % or flat amount
  markup_amount         DECIMAL(15,2),            -- computed markup
  billed_amount         DECIMAL(15,2),            -- base_cost + markup_amount
  minimum_amount        DECIMAL(15,2),            -- floor price override

  -- Invoice linkage
  supplier_invoice_id   UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  invoiced_at           TIMESTAMPTZ,

  -- Manual override
  override_amount       DECIMAL(15,2),     -- if set, use this instead of calculated
  override_reason       TEXT,

  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `markup_rules`
Default markup rules per supplier — applied automatically on allocation.

```sql
CREATE TABLE markup_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Rule definition
  markup_type     TEXT NOT NULL DEFAULT 'percentage'
                  CHECK (markup_type IN ('percentage','flat','none')),
  markup_value    DECIMAL(10,4) NOT NULL DEFAULT 0,
  minimum_amount  DECIMAL(15,2),          -- minimum billed amount per allocation
  courier_provider TEXT,                  -- NULL = applies to all couriers

  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, customer_id, courier_provider)
);
```

### Table: `supplier_invoices`
Generated invoices sent TO suppliers/customers.

```sql
CREATE TABLE supplier_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id      UUID REFERENCES households(id),
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Invoice identity
  invoice_number    TEXT NOT NULL,         -- auto-generated: SI-2025-0001
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  payment_terms     TEXT DEFAULT 'net_30',

  -- Financials
  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_rate          DECIMAL(5,2) DEFAULT 0,
  tax_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',

  -- Status
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at           TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- Branding & output
  pdf_path          TEXT,                  -- generated PDF storage path
  notes             TEXT,
  internal_notes    TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `supplier_invoice_lines`
Line items on a generated supplier invoice — one per AWB allocation.

```sql
CREATE TABLE supplier_invoice_lines (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_invoice_id   UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  awb_allocation_id     UUID REFERENCES awb_allocations(id) ON DELETE SET NULL,
  awb_id                UUID REFERENCES awbs(id) ON DELETE SET NULL,

  -- Line item
  description           TEXT NOT NULL,     -- "AWB 2895949593 — 3 PCS to London"
  awb_number            TEXT,
  pieces                INT,
  weight_kg             DECIMAL(10,3),
  shipment_date         DATE,
  destination           TEXT,

  -- Amounts
  unit_price            DECIMAL(15,4),     -- per-piece billed rate
  quantity              INT DEFAULT 1,
  line_total            DECIMAL(15,2) NOT NULL,

  sort_order            INT DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Relationship Diagram

```
auth.users
  └── courier_invoices (1:many)
        └── awbs (1:many)
              └── awb_allocations (1:many)
                    ├── customers (many:1) ← existing table
                    └── supplier_invoices (many:1)
                          └── supplier_invoice_lines (1:many)

customers (1:1) ── markup_rules
accounts (1:many) ── courier_invoices (payment account)
accounts (1:many) ── supplier_invoices (received payment account)
attachments ← extended to support courier_invoice_id (migration)
```

---

## 3. FOLDER & COMPONENT ARCHITECTURE

```
app/(app)/logistics/
├── page.tsx                          ← Logistics overview/dashboard
├── loading.tsx
├── courier-invoices/
│   ├── page.tsx                      ← List all courier invoices
│   ├── new/
│   │   └── page.tsx                  ← Create new courier invoice
│   └── [id]/
│       ├── page.tsx                  ← Invoice detail + AWB list
│       └── awbs/
│           └── [awbId]/
│               └── page.tsx          ← AWB detail + allocations
├── supplier-invoices/
│   ├── page.tsx                      ← List generated supplier invoices
│   └── [id]/
│       └── page.tsx                  ← Supplier invoice detail + PDF
├── markup-rules/
│   └── page.tsx                      ← Manage markup rules per customer
└── analytics/
    └── page.tsx                      ← Profitability dashboard

components/logistics/
├── courier-invoices/
│   ├── CourierInvoiceList.tsx
│   ├── CourierInvoiceForm.tsx        ← Create/edit invoice
│   ├── CourierInvoiceCard.tsx
│   ├── CourierInvoiceDetail.tsx
│   └── CourierInvoiceUpload.tsx      ← PDF/Excel upload with OCR hooks
├── awbs/
│   ├── AWBList.tsx
│   ├── AWBForm.tsx                   ← Add/edit AWB manually
│   ├── AWBCard.tsx
│   ├── AWBDetail.tsx
│   └── AWBChargeBreakdown.tsx        ← Visual charge breakdown
├── allocations/
│   ├── AllocationTable.tsx           ← Main piece allocation UI
│   ├── AllocationRow.tsx
│   ├── AllocationForm.tsx
│   ├── AllocationCalculator.tsx      ← Real-time cost preview
│   └── AllocationSummary.tsx
├── supplier-invoices/
│   ├── SupplierInvoiceList.tsx
│   ├── SupplierInvoiceDetail.tsx
│   ├── SupplierInvoiceGenerator.tsx  ← Generate invoice from allocations
│   ├── SupplierInvoicePDF.tsx        ← PDF preview component
│   └── InvoiceStatusBadge.tsx
├── markup-rules/
│   ├── MarkupRuleList.tsx
│   └── MarkupRuleForm.tsx
├── analytics/
│   ├── LogisticsDashboard.tsx
│   ├── AWBProfitabilityTable.tsx
│   ├── CourierSpendChart.tsx
│   └── SupplierBillingChart.tsx
└── shared/
    ├── CourierProviderBadge.tsx
    ├── AWBStatusBadge.tsx
    └── ProfitMarginIndicator.tsx

lib/logistics/
├── types.ts                          ← All TypeScript types for this module
├── calculations.ts                   ← Pure allocation + markup engine
├── invoice-generator.ts              ← Supplier invoice generation logic
├── pdf-generator.ts                  ← PDF rendering (React → PDF)
├── invoice-numbering.ts              ← Auto-increment SI-YYYY-NNNN
├── ocr/
│   ├── pipeline.ts                   ← OCR orchestration (future)
│   ├── dhl-parser.ts                 ← DHL-specific parser (future)
│   └── normalizer.ts                 ← Normalize parsed data to schema

supabase/
└── migration_v8_logistics.sql        ← All new tables + RLS + indexes
```

---

## 4. CALCULATION ENGINE DESIGN

### `lib/logistics/calculations.ts`

```typescript
// Pure functions — no side effects, fully testable

export interface AWBCostBreakdown {
  awbId: string
  awbNumber: string
  totalCharge: number
  totalPieces: number
  perPieceBaseCost: number
  allocations: AllocationResult[]
}

export interface AllocationResult {
  customerId: string
  customerName: string
  pieces: number
  baseCost: number
  markupType: 'percentage' | 'flat' | 'none'
  markupValue: number
  markupAmount: number
  billedAmount: number
  effectiveAmount: number   // after minimum floor
}

// Core calculation
export function calculateAWBAllocation(
  awbTotalCharge: number,
  allocations: Array<{
    customerId: string
    customerName: string
    pieces: number
    markupType: 'percentage' | 'flat' | 'none'
    markupValue: number
    minimumAmount?: number
    overrideAmount?: number
  }>
): AWBCostBreakdown

// Markup application
export function applyMarkup(
  baseCost: number,
  markupType: 'percentage' | 'flat' | 'none',
  markupValue: number,
  minimumAmount?: number
): { markupAmount: number; billedAmount: number }

// Recalculate after changes
export function recalculateAWB(awb: AWBWithAllocations): AWBCostBreakdown

// Profitability
export function calculateMargin(cost: number, billed: number): {
  margin: number
  marginPct: number
}
```

---

## 5. PDF GENERATION ARCHITECTURE

Use **`@react-pdf/renderer`** — renders React components to PDF client-side.
No server required. Works in Vercel Edge / browser.

```
lib/logistics/pdf/
├── SupplierInvoicePDF.tsx      ← Main PDF component
├── pdf-styles.ts               ← StyleSheet definitions
└── pdf-renderer.ts             ← generatePDF(invoiceId) → Blob → upload to storage
```

### Flow

```
1. Fetch supplier_invoice + lines + customer details from Supabase
2. Render <SupplierInvoicePDF data={invoice} /> via @react-pdf/renderer
3. pdf.toBlob() → upload to vaultr-attachments/logistics/invoices/{id}.pdf
4. Update supplier_invoices.pdf_path
5. Return signed URL for download/preview
```

---

## 6. UPLOAD & STORAGE ARCHITECTURE

```
Supabase Storage Bucket: vaultr-attachments (existing)
  └── logistics/
        ├── courier-invoices/{user_id}/{invoice_id}-{filename}
        └── supplier-invoices/{user_id}/{invoice_id}.pdf

New bucket: vaultr-logistics (optional, isolated)
```

Use existing `FileUpload` component pattern with a `logistics` prop.
Extend `attachments` table with `courier_invoice_id` column via migration.

---

## 7. OCR-READY ARCHITECTURE

### Future pipeline (designed now, implemented later)

```
lib/logistics/ocr/
├── pipeline.ts
│     uploadFile(path)
│       → extractText(pdf)          ← pdf-parse or Anthropic Vision
│       → parseStructure(text)      ← DHL-specific parser
│       → normalizeToSchema(data)   ← → CourierInvoice + AWB[] shapes
│       → createDraftRecords()      ← insert with ocr_status='done'
│       → flagForReview()           ← confidence < threshold
│
├── dhl-parser.ts
│     parseDHLInvoice(rawText): ParsedDHLInvoice
│     extractAWBs(section): ParsedAWB[]
│     extractCharges(awbSection): ChargeBreakdown
│
└── normalizer.ts
      normalizeParsedInvoice(parsed, provider): CourierInvoice
      normalizeParsedAWBs(parsed): AWB[]
```

### Database readiness

- `courier_invoices.ocr_status` tracks pipeline state
- `courier_invoices.ocr_raw_data JSONB` stores raw parsed output
- `awbs.raw_line_data JSONB` stores original extracted line
- `courier_invoices.ocr_confidence` stores overall confidence score

### Anthropic integration point (future)

```typescript
// pipeline.ts
async function extractWithAI(fileBase64: string, provider: string) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    messages: [{
      role: 'user',
      content: [{
        type: 'document',  // or image for scanned PDFs
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 }
      }, {
        type: 'text',
        text: `Extract all AWBs from this ${provider} invoice as JSON matching schema: {...}`
      }]
    }]
  })
  return JSON.parse(response.content[0].text)
}
```

---

## 8. UI/UX FLOW

### Screen 1 — Logistics Overview (Dashboard)
- Active courier invoices (unpaid)
- Pending supplier invoices
- This month: courier spend vs billed vs margin
- Quick action: "Upload Courier Invoice"

### Screen 2 — Courier Invoice Detail
```
[DHL Invoice #2025-001234]        [₹42,500]  [Pending]
  Invoice Date: 12 May 2025       Due: 26 May 2025

  AWBs (8)                        [+ Add AWB]
  ┌──────────────────────────────────────────────────┐
  │ AWB 2895949593  London  ₹3,698  11 PCS  ✓ Alloc │
  │ AWB 2895949594  Dubai   ₹2,100   5 PCS  ⚠ Partial│
  │ AWB 2895949595  NYC    ₹6,200   3 PCS  ○ Unalloc │
  └──────────────────────────────────────────────────┘
  [Generate All Supplier Invoices]
```

### Screen 3 — AWB Allocation (the key screen)
```
AWB 2895949593          London, UK
────────────────────────────────────
Charges:
  Shipment      ₹2,800.00
  Fuel           ₹548.25
  Demand         ₹350.00
  ──────────────────────
  Total        ₹3,698.25

Allocations:             Total: 11 PCS
┌────────────────┬────┬──────────┬──────────┬──────────┐
│ Supplier       │ PCS│ Base     │ Markup   │ Billed   │
├────────────────┼────┼──────────┼──────────┼──────────┤
│ Supplier A     │  1 │ ₹336.20  │ +20%     │ ₹403.44  │
│ Supplier B     │  3 │ ₹1,008.61│ +20%     │ ₹1,210.33│
│ Supplier C     │  7 │ ₹2,353.45│ +20%     │ ₹2,824.14│
│ [+ Add]        │    │          │          │          │
└────────────────┴────┴──────────┴──────────┴──────────┘
Per-piece base: ₹336.20    Total billed: ₹4,437.91
Margin: ₹739.66  (20.0%)
```

### Screen 4 — Generate Supplier Invoice
- Group allocations by customer
- Show all AWBs going on invoice
- Set invoice date, due date, tax
- Preview before generating
- One-tap PDF export

---

## 9. PHASED ROLLOUT PLAN

| Phase | What | Why |
|-------|------|-----|
| **P1** | Schema + migrations | Safe foundation, no prod impact |
| **P2** | Courier invoice upload + AWB manual entry | Core data entry |
| **P3** | Allocation engine + markup rules | Core business logic |
| **P4** | Supplier invoice generation | Output |
| **P5** | PDF generation | Exportable output |
| **P6** | Profitability dashboard | Analytics |
| **P7** | Mobile UI polish | Production quality |
| **P8** | OCR architecture prep | Future-ready |

---

## 10. PERFORMANCE CONSIDERATIONS

- **Indexes**: `awbs(courier_invoice_id)`, `awb_allocations(awb_id)`, `awb_allocations(customer_id)`, `supplier_invoices(customer_id)`, `supplier_invoice_lines(supplier_invoice_id)`
- **Computed columns**: `awbs.total_charge` as GENERATED ALWAYS STORED — DB does math
- **Denormalization**: Store `awb_number`, `shipment_date`, `destination` on `supplier_invoice_lines` to avoid joins on PDF generation
- **Lazy loading**: AWB list virtualised on mobile for invoices with 50+ AWBs
- **PDF generation**: Client-side via `@react-pdf/renderer` — no serverless function needed

---

## 11. MOBILE UX CONSIDERATIONS

- AWB allocation table scrolls horizontally on mobile — sticky first column (supplier name)
- "Add allocation" is a bottom sheet (not a modal) on mobile
- Piece count uses large tap targets (number stepper, not text input)
- Invoice generation is a single "Generate" CTA, not a wizard
- PDF preview via in-app lightbox (existing `FileUpload` pattern)
- Swipe to delete allocation rows

---

---
# CLAUDE CODE IMPLEMENTATION PROMPTS
---

## PROMPT 1 — Schema & Migrations

```
You are working on Vaultr, a live Next.js 15 / Supabase / TypeScript personal finance app.
The project is at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: create the database migration for a new Courier Allocation & Supplier Billing Engine module.
This migration MUST be additive-only (never drop existing tables or columns).

Create the file: supabase/migration_v8_logistics.sql

The migration must create these tables IN ORDER (respecting foreign keys):

1. courier_invoices
   - id UUID PK
   - user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
   - household_id UUID REFERENCES households(id)
   - courier_provider TEXT NOT NULL (e.g. 'DHL', 'FedEx', 'Aramex', 'UPS', 'custom')
   - invoice_number TEXT NOT NULL
   - invoice_date DATE NOT NULL
   - due_date DATE
   - currency TEXT NOT NULL DEFAULT 'INR'
   - subtotal DECIMAL(15,2) NOT NULL DEFAULT 0
   - tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - total_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - status TEXT NOT NULL DEFAULT 'pending' CHECK IN ('pending','partial','paid','cancelled')
   - paid_at TIMESTAMPTZ
   - account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
   - file_path TEXT
   - file_name TEXT
   - file_type TEXT
   - ocr_status TEXT DEFAULT 'none' CHECK IN ('none','queued','processing','done','failed')
   - ocr_raw_data JSONB
   - ocr_confidence DECIMAL(5,2)
   - notes TEXT
   - created_at, updated_at TIMESTAMPTZ

2. awbs
   - id UUID PK
   - user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
   - courier_invoice_id UUID NOT NULL REFERENCES courier_invoices(id) ON DELETE CASCADE
   - awb_number TEXT NOT NULL
   - shipment_date DATE
   - destination_country TEXT
   - destination_city TEXT
   - receiver_name TEXT
   - receiver_reference TEXT
   - actual_weight DECIMAL(10,3)
   - volumetric_weight DECIMAL(10,3)
   - chargeable_weight DECIMAL(10,3)
   - weight_unit TEXT DEFAULT 'KG'
   - shipment_charge DECIMAL(15,2) NOT NULL DEFAULT 0
   - fuel_surcharge DECIMAL(15,2) NOT NULL DEFAULT 0
   - demand_surcharge DECIMAL(15,2) NOT NULL DEFAULT 0
   - gogreen_surcharge DECIMAL(15,2) NOT NULL DEFAULT 0
   - remote_area_charge DECIMAL(15,2) NOT NULL DEFAULT 0
   - other_charges DECIMAL(15,2) NOT NULL DEFAULT 0
   - tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - total_charge DECIMAL(15,2) GENERATED ALWAYS AS (sum of all charges) STORED
   - total_pieces INT NOT NULL DEFAULT 0
   - allocated_pieces INT NOT NULL DEFAULT 0
   - per_piece_base_cost DECIMAL(15,4)
   - service_type TEXT
   - product_code TEXT
   - raw_line_data JSONB
   - notes TEXT
   - created_at, updated_at TIMESTAMPTZ
   - UNIQUE(courier_invoice_id, awb_number)

3. markup_rules
   - id UUID PK
   - user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
   - customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE
   - markup_type TEXT NOT NULL DEFAULT 'percentage' CHECK IN ('percentage','flat','none')
   - markup_value DECIMAL(10,4) NOT NULL DEFAULT 0
   - minimum_amount DECIMAL(15,2)
   - courier_provider TEXT (NULL = all couriers)
   - is_active BOOLEAN NOT NULL DEFAULT TRUE
   - notes TEXT
   - created_at, updated_at TIMESTAMPTZ
   - UNIQUE(user_id, customer_id, courier_provider)

4. supplier_invoices
   - id UUID PK
   - user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
   - household_id UUID REFERENCES households(id)
   - customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE
   - invoice_number TEXT NOT NULL
   - invoice_date DATE NOT NULL DEFAULT CURRENT_DATE
   - due_date DATE
   - payment_terms TEXT DEFAULT 'net_30'
   - subtotal DECIMAL(15,2) NOT NULL DEFAULT 0
   - tax_rate DECIMAL(5,2) DEFAULT 0
   - tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - total_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0
   - currency TEXT NOT NULL DEFAULT 'INR'
   - status TEXT NOT NULL DEFAULT 'draft' CHECK IN ('draft','sent','paid','overdue','cancelled')
   - sent_at TIMESTAMPTZ
   - paid_at TIMESTAMPTZ
   - account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
   - pdf_path TEXT
   - notes TEXT
   - internal_notes TEXT
   - created_at, updated_at TIMESTAMPTZ

5. supplier_invoice_lines
   - id UUID PK
   - supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE
   - awb_id UUID REFERENCES awbs(id) ON DELETE SET NULL
   - description TEXT NOT NULL
   - awb_number TEXT
   - pieces INT
   - weight_kg DECIMAL(10,3)
   - shipment_date DATE
   - destination TEXT
   - unit_price DECIMAL(15,4)
   - quantity INT DEFAULT 1
   - line_total DECIMAL(15,2) NOT NULL
   - sort_order INT DEFAULT 0
   - created_at TIMESTAMPTZ

6. awb_allocations
   - id UUID PK
   - user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
   - awb_id UUID NOT NULL REFERENCES awbs(id) ON DELETE CASCADE
   - customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE
   - pieces INT NOT NULL DEFAULT 1 CHECK (pieces > 0)
   - weight_kg DECIMAL(10,3)
   - base_cost DECIMAL(15,2)
   - markup_type TEXT DEFAULT 'percentage' CHECK IN ('percentage','flat','none')
   - markup_value DECIMAL(10,4) DEFAULT 0
   - markup_amount DECIMAL(15,2)
   - billed_amount DECIMAL(15,2)
   - minimum_amount DECIMAL(15,2)
   - supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL
   - invoiced_at TIMESTAMPTZ
   - override_amount DECIMAL(15,2)
   - override_reason TEXT
   - notes TEXT
   - created_at, updated_at TIMESTAMPTZ

7. Extend existing attachments table:
   ALTER TABLE attachments ADD COLUMN IF NOT EXISTS courier_invoice_id UUID REFERENCES courier_invoices(id) ON DELETE CASCADE;

For ALL tables:
- Enable RLS
- Add policy: "Users can CRUD own [table]" FOR ALL USING (auth.uid() = user_id)
- Add household policy where household_id exists

Add performance indexes:
- awbs(courier_invoice_id)
- awbs(user_id)
- awb_allocations(awb_id)
- awb_allocations(customer_id)
- awb_allocations(supplier_invoice_id)
- supplier_invoices(customer_id)
- supplier_invoices(user_id, status)
- supplier_invoice_lines(supplier_invoice_id)
- markup_rules(user_id, customer_id)
- courier_invoices(user_id, status)

Also add a function for auto-incrementing supplier invoice numbers:
CREATE OR REPLACE FUNCTION generate_supplier_invoice_number(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT 'SI-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(COALESCE(
      (SELECT COUNT(*) + 1 FROM supplier_invoices WHERE user_id = p_user_id
       AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW()))::TEXT,
    '1'), 4, '0')
$$ LANGUAGE SQL STABLE;

After creating the migration file, verify it has no syntax errors by reviewing it carefully.
Do NOT run it yet — just create the file.
Print "Migration file created: supabase/migration_v8_logistics.sql" when done.
```

---

## PROMPT 2 — TypeScript Types & Calculation Engine

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: create the TypeScript types and pure calculation engine for the Courier Allocation & Supplier Billing module.

STEP 1: Create lib/logistics/types.ts

Define these TypeScript types/interfaces:

- CourierProvider: union type 'DHL' | 'FedEx' | 'Aramex' | 'UPS' | 'custom'
- CourierInvoiceStatus: 'pending' | 'partial' | 'paid' | 'cancelled'
- OCRStatus: 'none' | 'queued' | 'processing' | 'done' | 'failed'
- SupplierInvoiceStatus: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
- MarkupType: 'percentage' | 'flat' | 'none'

- CourierInvoice interface (matches courier_invoices table)
- AWB interface (matches awbs table, all charge columns, computed total_charge)
- AWBAllocation interface (matches awb_allocations table, includes customer?: Customer)
- MarkupRule interface (matches markup_rules table)
- SupplierInvoice interface (matches supplier_invoices table, includes customer?: Customer, lines?: SupplierInvoiceLine[])
- SupplierInvoiceLine interface (matches supplier_invoice_lines table)

Also define calculation-specific types:
- AllocationInput: { customerId: string; customerName: string; pieces: number; markupType: MarkupType; markupValue: number; minimumAmount?: number; overrideAmount?: number }
- AllocationResult: extends AllocationInput with { baseCost: number; markupAmount: number; billedAmount: number; effectiveAmount: number; perPieceRate: number }
- AWBCalculation: { awbId: string; awbNumber: string; totalCharge: number; totalPieces: number; perPieceBaseCost: number; allocations: AllocationResult[]; totalBilled: number; totalMargin: number; marginPct: number }

STEP 2: Create lib/logistics/calculations.ts

Implement pure calculation functions (no Supabase calls, fully testable):

export function calculatePerPieceCost(totalCharge: number, totalPieces: number): number
  - Returns totalCharge / totalPieces, rounded to 4 decimal places
  - Throws if totalPieces === 0

export function applyMarkup(baseCost: number, markupType: MarkupType, markupValue: number, minimumAmount?: number): { markupAmount: number; billedAmount: number }
  - percentage: billedAmount = baseCost * (1 + markupValue / 100)
  - flat: billedAmount = baseCost + markupValue
  - none: billedAmount = baseCost
  - Apply minimumAmount floor after calculation
  - Round all results to 2 decimal places

export function calculateAWBAllocation(awbTotalCharge: number, inputs: AllocationInput[]): AWBCalculation
  - Validates inputs (non-empty, all pieces > 0)
  - Calculates perPieceBaseCost
  - For each input: baseCost = pieces * perPieceBaseCost, then applyMarkup
  - If overrideAmount set, use that as effectiveAmount
  - Returns full AWBCalculation with totals and margins

export function calculateMargin(cost: number, billed: number): { margin: number; marginPct: number }

export function resolveMarkupForCustomer(customerId: string, markupRules: MarkupRule[], courierProvider?: string): { markupType: MarkupType; markupValue: number; minimumAmount?: number }
  - Find rule matching customer + provider, fall back to customer's general rule
  - Return defaults (percentage, 0) if no rule

export function summariseAWBSet(calculations: AWBCalculation[]): { totalCost: number; totalBilled: number; totalMargin: number; marginPct: number }

Requirements:
- All functions exported
- Full TypeScript types throughout
- JSDoc comments on each function
- No external dependencies
- Round monetary values to 2 decimal places consistently

STEP 3: Create lib/logistics/invoice-numbering.ts

export async function getNextSupplierInvoiceNumber(supabase: SupabaseClient, userId: string): Promise<string>
  - Calls the generate_supplier_invoice_number(userId) SQL function via supabase.rpc()
  - Returns the invoice number string

After creating all three files, run: npx tsc --noEmit
Fix any TypeScript errors before finishing.
Print file paths created when done.
```

---

## PROMPT 3 — Courier Invoice Upload Module

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build the Courier Invoice upload and management UI.
This is Phase 3 of the Logistics module. Phases 1 (schema) and 2 (types/engine) are already complete.

Do NOT break any existing functionality. Do NOT modify existing tables or components.

STEP 1: Create app/(app)/logistics/page.tsx (Server Component)
- Fetch courier_invoices for current user, order by created_at DESC, limit 20
- Fetch counts: total invoices, pending count, this-month total spend
- Pass to <LogisticsOverviewClient />
- Add export const dynamic = 'force-dynamic'

STEP 2: Create app/(app)/logistics/loading.tsx
- Skeleton loading state matching the overview layout

STEP 3: Create app/(app)/logistics/courier-invoices/page.tsx (Server Component)
- Fetch all courier_invoices with count of AWBs joined
- Pass to <CourierInvoiceListClient />

STEP 4: Create app/(app)/logistics/courier-invoices/new/page.tsx
- Renders <CourierInvoiceForm mode="create" />

STEP 5: Create app/(app)/logistics/courier-invoices/[id]/page.tsx (Server Component)
- Fetch courier_invoice by id with: awbs (ordered by shipment_date), attachments
- Fetch awbs with allocated_pieces and total_pieces
- Pass to <CourierInvoiceDetailClient />

STEP 6: Create components/logistics/courier-invoices/CourierInvoiceForm.tsx ('use client')

Fields:
- courier_provider: button group selector (DHL / FedEx / Aramex / UPS / Custom text input)
- invoice_number: text input (required)
- invoice_date: date input (required)
- due_date: date input
- currency: select (INR default, USD, EUR, AED, GBP)
- subtotal: number input
- tax_amount: number input
- total_amount: number input (auto-calculated but editable)
- account_id: dropdown from user's accounts
- notes: textarea
- File upload: accept PDF and Excel (.xlsx, .xls)
  - Upload to Supabase storage: logistics/courier-invoices/{userId}/{timestamp}-{filename}
  - Store file_path and file_name in record
  - Show upload progress

On save:
- INSERT into courier_invoices
- If file uploaded, update file_path/file_name
- Redirect to /logistics/courier-invoices/{id}

STEP 7: Create components/logistics/courier-invoices/CourierInvoiceList.tsx ('use client')

Display as a clean table/list:
- Columns: Courier (with logo/badge), Invoice #, Date, AWBs count, Total, Status, Actions
- Status badge: pending=amber, paid=green, cancelled=red
- Row click → navigate to detail
- Empty state with "Upload your first courier invoice" CTA

STEP 8: Create components/logistics/courier-invoices/CourierInvoiceDetail.tsx ('use client')

Layout:
- Top: invoice header (provider, number, date, amount, status)
- Middle: AWB list (see AWBCard component below)
- AWB card shows: AWB number, destination, total charge, pieces, allocation status (unallocated/partial/complete)
- Bottom: actions bar (Add AWB, Generate All Invoices, Mark as Paid)

STEP 9: Create components/logistics/shared/CourierProviderBadge.tsx
- Renders a colored badge/chip for each courier (DHL=yellow, FedEx=purple, Aramex=orange, UPS=brown)

STEP 10: Add "Logistics" to the navigation in components/AppShell.tsx
- Add to navItems array: { href: '/logistics', label: 'Logistics', icon: Package } (import Package from lucide-react)
- Place it after 'Bills' in the list

Requirements:
- Use var(--bg), var(--surface), var(--border), var(--text), var(--brand) CSS variables throughout
- No hardcoded colors — theme must work in both light and dark mode
- Mobile responsive: list collapses gracefully on small screens
- Follow existing Vaultr component patterns (see components/bills/ for reference)
- Strong TypeScript — import types from lib/logistics/types.ts
- Loading states on all async operations
- Error handling with user-friendly messages
- Use createClient from @/lib/supabase/client for mutations

Run: npx tsc --noEmit && npm run build
Fix any errors before finishing.
```

---

## PROMPT 4 — AWB Management System

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build the AWB (Air Waybill) management system.
Phase 1 (schema), 2 (types/engine), 3 (courier invoice upload) are complete.

STEP 1: Create app/(app)/logistics/courier-invoices/[id]/awbs/[awbId]/page.tsx (Server Component)
- Fetch AWB by awbId, verify it belongs to the courier_invoice [id]
- Fetch awb_allocations for this AWB, join customer details
- Fetch markup_rules for user (to pre-populate defaults)
- Pass to <AWBDetailClient />

STEP 2: Create components/logistics/awbs/AWBForm.tsx ('use client')

A sheet/modal for adding or editing an AWB.
Fields:
- awb_number: text input (required, shown prominently)
- shipment_date: date input
- receiver_name: text input
- destination_country: text input
- destination_city: text input
- weight section:
  - actual_weight: number
  - volumetric_weight: number
  - chargeable_weight: number (auto = max of actual/volumetric, overrideable)
  - weight_unit: KG / LB selector
- Charges section (each its own labeled input):
  - shipment_charge (required)
  - fuel_surcharge
  - demand_surcharge
  - gogreen_surcharge
  - remote_area_charge
  - other_charges
  - tax_amount
- total_charge: computed and displayed read-only (sum of all charges)
- service_type: text (EXPRESS / ECONOMY / etc.)
- notes: textarea

Live preview: as user enters charges, show running total prominently.

On save: INSERT or UPDATE awbs record, then redirect back to courier invoice detail.

STEP 3: Create components/logistics/awbs/AWBCard.tsx
Card layout showing:
- AWB number (large, monospace font)
- Destination + receiver
- Total charge (prominent)
- Charge breakdown: mini pills for each surcharge that has a value
- Pieces: "{allocated}/{total} PCS" with color (green=complete, amber=partial, red=unallocated)
- Tap/click → navigate to AWB detail page

STEP 4: Create components/logistics/awbs/AWBDetail.tsx ('use client')

Layout:
- Header: AWB number, destination, shipment date
- Charge breakdown table:
  Shipment Charge     ₹2,800.00
  Fuel Surcharge        ₹548.25
  Demand Surcharge      ₹350.00
  ──────────────────────────────
  Total               ₹3,698.25
- Per-piece cost (displayed live, recalculates as allocations change):
  "Per piece (11 PCS): ₹336.20"
- Allocation table (see Prompt 5 for AllocationTable)
- Profitability summary:
  Total Cost: ₹3,698.25 | Total Billed: ₹4,437.91 | Margin: ₹739.66 (20.0%)

STEP 5: Create components/logistics/awbs/AWBChargeBreakdown.tsx
Reusable component showing charges in a clean breakdown table.
Accept: awb (AWB type)
Display all non-zero charges with labels and amounts, then a total line.

Requirements:
- Monospace font for AWB numbers (font-mono)
- Charge amounts formatted with formatCurrency from @/lib/utils
- Mobile: charge breakdown collapses into a summary "tap to expand" pattern
- TypeScript strict throughout
- All components export as default

Run: npx tsc --noEmit
Fix any errors.
```

---

## PROMPT 5 — Supplier Allocation Engine UI

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build the supplier allocation UI — the core operational screen of the logistics module.
Phases 1–4 are complete. The calculation engine in lib/logistics/calculations.ts is ready.

STEP 1: Create components/logistics/allocations/AllocationTable.tsx ('use client')

This is the MAIN operational component. It shows all supplier allocations for one AWB.

Props:
- awb: AWB (with total_charge)
- initialAllocations: AWBAllocation[] (with customer details)
- markupRules: MarkupRule[]
- onAllocationsChange?: (allocations: AWBAllocation[]) => void

Features:
- Table with columns: Supplier | PCS | Base Cost | Markup | Billed Amount | Actions
- Each row is live-editing — changes trigger instant recalculation
- PCS input: stepper buttons (−/+) with direct number input, min=1
- Markup: shows default from markup_rules, allow override per-row
  - Toggle between: "Default (20%)" | "Custom %___" | "Flat ₹___" | "None"
- Billed Amount: calculated and displayed, can be overridden (show override indicator)
- Delete row: swipe on mobile, ✕ button on desktop
- Summary row at bottom:
  Total: {totalPieces} PCS | Cost: ₹X | Billed: ₹X | Margin: ₹X (X%)
- "Per piece base: ₹X.XX" shown prominently above table
- "+ Add Supplier" button opens AllocationForm below table

State management:
- Local state for all allocations
- Call calculateAWBAllocation from lib/logistics/calculations.ts on every change
- Debounced save to Supabase (500ms after last change)
- Show save indicator (saving... / saved / error)

STEP 2: Create components/logistics/allocations/AllocationForm.tsx ('use client')

A compact inline form (appears below the table when "+ Add Supplier" is tapped):
- Customer selector: searchable dropdown from customers table
  - Show customer name + any existing markup rule
  - "Quick add" if customer not found
- PCS: number stepper
- Markup: auto-populated from markup_rules for that customer, editable
- Minimum amount: optional floor override
- Submit: "Add" button — adds row to table and triggers recalculation

On submit: INSERT into awb_allocations, update awbs.allocated_pieces

STEP 3: Create components/logistics/allocations/AllocationSummary.tsx

Read-only summary panel:
- Per-piece base cost (formatted to 4 decimals)
- Total pieces allocated vs total pieces on AWB
- Total cost (AWB charge)
- Total billed to suppliers
- Gross margin amount
- Margin percentage (with color: green ≥15%, amber 5-15%, red <5%)

STEP 4: Create a server action or API route: app/api/logistics/allocations/recalculate/route.ts
- POST: { awbId, allocations: AllocationInput[] }
- Calls calculateAWBAllocation engine
- Returns: AWBCalculation
- Updates awb_allocations records in batch
- Updates awbs.allocated_pieces, awbs.per_piece_base_cost

STEP 5: Create components/logistics/allocations/MarkupRuleForm.tsx ('use client')
Quick form for setting a customer's default markup rule.
Fields: customer (display only), markup_type selector, markup_value, minimum_amount, courier_provider (optional)
Used both in markup-rules page and inline from allocation table.

Requirements:
- The allocation table MUST work well on mobile:
  - On screens < 768px: use card-based layout instead of table
  - Each allocation = a card with supplier name, PCS, billed amount, edit/delete
  - "+ Add" opens bottom sheet
- All monetary values: formatCurrency from @/lib/utils
- Optimistic UI: changes appear immediately, save in background
- Strong error recovery: if save fails, show error toast and revert
- TypeScript strict

Run: npx tsc --noEmit
Fix any errors.
```

---

## PROMPT 6 — Supplier Invoice Generation

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build the supplier invoice generation system.
Phases 1–5 are complete.

STEP 1: Create lib/logistics/invoice-generator.ts

export async function generateSupplierInvoice(params: {
  supabase: SupabaseClient
  userId: string
  customerId: string
  allocationIds: string[]        // awb_allocation IDs to include
  invoiceDate: string
  dueDate?: string
  taxRate?: number
  notes?: string
  accountId?: string
}): Promise<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[] }>

Logic:
1. Fetch all awb_allocations by allocationIds, join AWB and customer data
2. Validate all belong to userId and are not already invoiced
3. Generate invoice number using getNextSupplierInvoiceNumber()
4. For each allocation, build a SupplierInvoiceLine:
   description = "AWB {awb_number} — {pieces} PCS → {destination_city}"
   awb_number, pieces, weight_kg, shipment_date, destination from AWB
   unit_price = effectiveAmount / pieces
   line_total = effectiveAmount (or override_amount if set)
5. Calculate subtotal = sum of line_totals
6. Calculate tax_amount = subtotal * taxRate / 100
7. Calculate total_amount = subtotal + tax_amount
8. INSERT supplier_invoices record
9. INSERT all supplier_invoice_lines
10. UPDATE awb_allocations: set supplier_invoice_id, invoiced_at
11. Return created invoice + lines

export async function markInvoicePaid(params: {
  supabase: SupabaseClient
  invoiceId: string
  paidAmount: number
  accountId: string
  createTransaction?: boolean    // if true, also creates a transaction record
}): Promise<void>

STEP 2: Create components/logistics/supplier-invoices/SupplierInvoiceGenerator.tsx ('use client')

A multi-step generator UI:

Step 1 — Select Allocations:
- Show all uninvoiced allocations for a selected customer
- Grouped by AWB
- Checkbox select which to include
- Running total updates as items selected

Step 2 — Invoice Settings:
- Invoice date (default: today)
- Due date (default: +30 days)
- Tax rate % (default: 0, common values: 0%, 18% GST)
- Account (where payment will be received)
- Notes (shown on invoice)
- Payment terms

Step 3 — Preview & Generate:
- Show invoice summary:
  Customer name, address, invoice number
  Line items table
  Subtotal, tax, total
- "Generate Invoice" button
- On success: show success state, buttons for "View Invoice" and "Download PDF"

STEP 3: Create app/(app)/logistics/supplier-invoices/page.tsx (Server Component)
- Fetch supplier_invoices for user, join customer name, order by created_at DESC
- Summary stats: total outstanding, total paid this month
- Pass to <SupplierInvoiceListClient />

STEP 4: Create app/(app)/logistics/supplier-invoices/[id]/page.tsx (Server Component)
- Fetch supplier_invoice with lines and customer
- Pass to <SupplierInvoiceDetailClient />

STEP 5: Create components/logistics/supplier-invoices/SupplierInvoiceDetail.tsx ('use client')

Layout:
- Invoice header: customer name, invoice number, date, due date, status badge
- Line items table: AWB | Description | PCS | Destination | Amount
- Totals: subtotal, tax, total (right-aligned)
- Footer: notes, payment terms
- Actions: Download PDF | Mark as Sent | Mark as Paid | Cancel

STEP 6: Create components/logistics/supplier-invoices/InvoiceStatusBadge.tsx
- draft: gray
- sent: blue
- paid: green
- overdue: red
- cancelled: gray strikethrough

Requirements:
- Invoice generation must be atomic (use a transaction / all-or-nothing inserts)
- If any insert fails, rollback all changes (use Supabase transaction or error handling that deletes partial records)
- TypeScript strict
- Handle edge case: if allocationIds includes already-invoiced items, throw clear error

Run: npx tsc --noEmit
Fix any errors.
```

---

## PROMPT 7 — PDF Generation

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build PDF generation for supplier invoices.
Phases 1–6 are complete.

STEP 1: Install dependency
Run: npm install @react-pdf/renderer
Run: npm install --save-dev @types/react-pdf

STEP 2: Create lib/logistics/pdf/pdf-styles.ts
Define StyleSheet.create() with styles matching Vaultr's premium aesthetic:
- Page: white background, padding 40px, font: Helvetica
- Header section: company name large bold, invoice title
- Info grid: two-column layout for bill-to / invoice-details
- Table: clean lines, subtle row stripes
- Totals: right-aligned, bold total row
- Footer: small gray text
Colors to use: #6366F1 (brand), #111827 (text), #6B7280 (muted), #E5E7EB (border)

STEP 3: Create lib/logistics/pdf/SupplierInvoicePDF.tsx

A React PDF component using @react-pdf/renderer:

Props: { invoice: SupplierInvoice & { customer: Customer; lines: SupplierInvoiceLine[] }; companyName?: string; companyAddress?: string }

Sections:
1. Header:
   - Left: "VAULTR" logo text in brand color, company name/address below
   - Right: "TAX INVOICE" large, invoice number, date, due date

2. Bill To box:
   - Customer name (bold)
   - Customer address
   - GST number if present
   - Email

3. Line items table:
   Headers: # | AWB Number | Description | PCS | Destination | Amount
   Rows: each SupplierInvoiceLine
   Stripe alternate rows with light gray

4. Totals section (right-aligned):
   Subtotal: ₹X,XXX.XX
   GST (18%): ₹XXX.XX    ← only if tax_rate > 0
   ─────────────────
   Total: ₹X,XXX.XX      ← bold, larger

5. Payment terms & notes:
   "Payment Terms: Net 30"
   Notes text if present

6. Footer:
   "Generated by Vaultr • {date}"
   Small gray text

STEP 4: Create lib/logistics/pdf/pdf-renderer.ts

export async function generateAndStorePDF(params: {
  supabase: SupabaseClient
  invoiceId: string
  userId: string
}): Promise<string>  // Returns signed URL

Logic:
1. Fetch full invoice data (supplier_invoice + lines + customer)
2. Dynamic import @react-pdf/renderer (avoid SSR issues)
3. const blob = await pdf(<SupplierInvoicePDF data={...} />).toBlob()
4. Upload blob to Supabase storage:
   path: logistics/supplier-invoices/{userId}/{invoiceId}.pdf
   contentType: 'application/pdf'
5. UPDATE supplier_invoices SET pdf_path = {path}
6. Return createSignedUrl(path, 3600)

export async function getInvoicePDFUrl(params: {
  supabase: SupabaseClient
  invoiceId: string
}): Promise<string | null>
  - Fetch pdf_path from supplier_invoices
  - If exists, return fresh signed URL (3600s)
  - If not, return null (caller should trigger generateAndStorePDF)

STEP 5: Add PDF download button to SupplierInvoiceDetail.tsx
- "Download PDF" button
- On click: call getInvoicePDFUrl, if null call generateAndStorePDF first
- Show loading state during generation
- Use in-app lightbox (existing FileUpload pattern) for preview on mobile
- Direct download on desktop via anchor[download]

Requirements:
- @react-pdf/renderer must be dynamically imported (not SSR-compatible)
- PDF generation should happen client-side only (no serverless function)
- Handle large invoices (50+ line items) without memory issues
- The PDF must look professional enough to send to suppliers
- Test with at least a mock invoice object to verify PDF renders without errors

Run: npx tsc --noEmit && npm run build
Fix any errors (especially around dynamic imports and SSR).
```

---

## PROMPT 8 — Profitability Dashboard

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: build the Logistics profitability and analytics dashboard.
Phases 1–7 are complete.

STEP 1: Create app/(app)/logistics/analytics/page.tsx (Server Component)
Fetch (all with user_id filter):
- Last 6 months: courier_invoices grouped by month → total_amount SUM
- Last 6 months: supplier_invoices grouped by month → total_amount SUM
- By courier_provider: SUM total_amount from courier_invoices
- Top 5 customers by billed amount (from supplier_invoices)
- Outstanding supplier invoices (status = 'sent' or 'overdue')
- AWBs with no allocations (unallocated)
Pass all to <LogisticsAnalyticsClient />

STEP 2: Create components/logistics/analytics/LogisticsDashboard.tsx ('use client')

Layout — 4 summary cards at top:
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Courier Spend   │ Total Billed    │ Gross Margin    │ Outstanding     │
│ This Month      │ This Month      │ This Month      │ Invoices        │
│ ₹42,500         │ ₹51,800         │ ₹9,300 (21.9%) │ ₹18,400         │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

Then two charts side by side (stacked on mobile):
- Monthly Courier Spend vs Billed (bar chart, 6 months)
  Use a simple inline SVG chart (no chart library needed — just rectangles)
- Margin % by month (line chart using inline SVG)

Then tables:
- Top Customers table: Customer | AWBs | Total Billed | Unpaid
- Outstanding Invoices: Customer | Invoice # | Amount | Due Date | Overdue badge
- Unallocated AWBs: AWB # | Courier | Date | Amount | [Allocate] button

STEP 3: Create components/logistics/analytics/AWBProfitabilityTable.tsx

Table showing all AWBs for a selected month:
Columns: AWB # | Courier | Destination | PCS | AWB Cost | Billed | Margin | Margin %
- Color code margin % column (green ≥15%, amber 5-15%, red <5%)
- Sortable by any column
- Tap row → navigate to AWB detail

STEP 4: Create a Supabase view for analytics (add to migration or new SQL file):

CREATE OR REPLACE VIEW logistics_awb_profitability AS
SELECT
  a.id,
  a.awb_number,
  a.shipment_date,
  a.destination_country,
  a.destination_city,
  a.total_charge as awb_cost,
  a.total_pieces,
  a.allocated_pieces,
  ci.courier_provider,
  ci.invoice_number as courier_invoice_number,
  ci.invoice_date,
  COALESCE(SUM(alloc.billed_amount), 0) as total_billed,
  COALESCE(SUM(alloc.billed_amount), 0) - a.total_charge as gross_margin,
  CASE WHEN a.total_charge > 0
    THEN ROUND(((COALESCE(SUM(alloc.billed_amount), 0) - a.total_charge) / a.total_charge * 100)::numeric, 2)
    ELSE 0
  END as margin_pct,
  a.user_id
FROM awbs a
JOIN courier_invoices ci ON ci.id = a.courier_invoice_id
LEFT JOIN awb_allocations alloc ON alloc.awb_id = a.id
GROUP BY a.id, a.awb_number, a.shipment_date, a.destination_country,
  a.destination_city, a.total_charge, a.total_pieces, a.allocated_pieces,
  ci.courier_provider, ci.invoice_number, ci.invoice_date, a.user_id;

GRANT SELECT ON logistics_awb_profitability TO authenticated;

Requirements:
- Charts must work without any chart library (inline SVG or CSS-based)
- All monetary values: formatCurrency from @/lib/utils
- Mobile: cards stack vertically, tables scroll horizontally
- Empty states with helpful CTAs (e.g. "Upload your first courier invoice")
- TypeScript strict

Run: npx tsc --noEmit
Fix any errors.
```

---

## PROMPT 9 — Mobile UI Polish

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: polish the entire logistics module for production mobile quality.
Phases 1–8 are complete. Now make it feel premium and fast on iPhone.

STEP 1: Review and fix ALL logistics components for mobile layout:

For each component in components/logistics/:
- Ensure no horizontal overflow (use overflow-x-auto on tables, not on pages)
- Replace all hardcoded colors with CSS variables (var(--surface), var(--border), etc.)
- Ensure tap targets are minimum 44×44px
- Add tap-scale class (defined in globals.css) to all interactive elements
- Add loading skeletons matching the shape of the content

STEP 2: AWB Allocation Table — mobile card view
In AllocationTable.tsx:
- On mobile (< 768px): render each allocation as a card instead of table row
- Card layout:
  Top: Customer name (bold) + [PCS stepper]
  Bottom left: Base ₹X.XX + Markup label
  Bottom right: Billed ₹X.XX (prominent)
  Row: swipe left reveals delete button
- Add swipe-to-delete using CSS transforms + touch events (no library)

STEP 3: AWB Form — mobile sheet
- Wrap AWBForm in a bottom sheet on mobile (slide up from bottom, full width)
- Use same slide-up animation from globals.css
- Backdrop blur overlay
- Handle: 32px wide drag handle bar at top
- Dismiss on backdrop tap or swipe down gesture

STEP 4: Courier Invoice Detail — mobile UX
- AWB cards: horizontal scroll if many AWBs on one invoice (no-scrollbar class)
- "Add AWB" = floating action button on mobile (same pattern as transactions + button)
- Invoice header info: two-column grid on mobile

STEP 5: Create loading skeletons
For each main page, create a loading.tsx with skeleton matching the page structure:
- app/(app)/logistics/loading.tsx
- app/(app)/logistics/courier-invoices/loading.tsx
- app/(app)/logistics/supplier-invoices/loading.tsx
Use the existing .skeleton CSS class from globals.css.

STEP 6: Add page transitions
Each logistics page's main container div should have className="page-enter fade-in"
This uses the existing animation from globals.css.

STEP 7: Empty states
Every list component needs an empty state:
- courier invoices: box icon, "No courier invoices yet", "Upload Invoice" CTA button
- AWBs: "No AWBs on this invoice yet", "Add AWB Manually" CTA
- allocations: "No suppliers allocated", "Add Supplier" CTA
- supplier invoices: "No invoices generated", explain workflow briefly

STEP 8: Toast/feedback system
Logistics operations need immediate feedback. Check if Vaultr has a toast system.
If not, create components/shared/Toast.tsx — a simple fixed-position toast:
- Success (green), Error (red), Info (blue)
- Auto-dismiss after 3 seconds
- Slide in from bottom on mobile
Use in all logistics mutation operations.

Requirements:
- Do NOT add any new npm packages for animations or touch handling
- Use only CSS transforms and existing globals.css utilities
- All changes must work in both light and dark mode
- Test each component by reviewing it for dark mode CSS variable usage
- No inline style colors — only CSS variables

Run: npx tsc --noEmit && npm run build
Fix all errors. Print summary of changes made.
```

---

## PROMPT 10 — OCR-Ready Architecture Preparation

```
You are working on Vaultr at: /Users/diliptr/Documents/Claude/Projects/Finance Software/Vaultr

Your task: prepare the architecture for future AI/OCR-based courier invoice parsing.
Do NOT implement full AI extraction. Build the pipeline structure, types, and placeholder services.
Phases 1–9 are complete and the module is production-ready.

STEP 1: Create lib/logistics/ocr/types.ts

Define types for the OCR pipeline:

interface ParsedAWBCharge {
  label: string
  amount: number
  confidence: number  // 0-1
}

interface ParsedAWB {
  awbNumber: string
  shipmentDate?: string
  receiverName?: string
  destinationCountry?: string
  destinationCity?: string
  actualWeight?: number
  volumetricWeight?: number
  chargeableWeight?: number
  charges: ParsedAWBCharge[]
  rawText: string       // original text section this was parsed from
  confidence: number    // overall confidence 0-1
}

interface ParsedCourierInvoice {
  provider: string
  invoiceNumber?: string
  invoiceDate?: string
  currency?: string
  totalAmount?: number
  taxAmount?: number
  awbs: ParsedAWB[]
  rawData: string       // full raw text
  parseMethod: 'manual' | 'regex' | 'ai'
  confidence: number
}

interface OCRPipelineResult {
  status: 'success' | 'partial' | 'failed'
  parsed: ParsedCourierInvoice | null
  errors: string[]
  warnings: string[]
  processingMs: number
}

STEP 2: Create lib/logistics/ocr/pipeline.ts

export class OCRPipeline {
  constructor(private supabase: SupabaseClient) {}

  // Main entry point — called after file upload
  async processFile(params: {
    courierInvoiceId: string
    filePath: string
    fileType: 'pdf' | 'excel'
    provider: string
  }): Promise<OCRPipelineResult>

  // Step 1: Extract raw text from file
  private async extractText(filePath: string, fileType: string): Promise<string>
  // TODO: implement with pdf-parse for PDF, xlsx for Excel

  // Step 2: Parse structure from raw text
  private async parseStructure(rawText: string, provider: string): Promise<ParsedCourierInvoice>
  // Routes to provider-specific parser

  // Step 3: Normalize to Vaultr schema
  private normalizeToSchema(parsed: ParsedCourierInvoice): {
    invoice: Partial<CourierInvoice>
    awbs: Partial<AWB>[]
  }

  // Step 4: Create draft records
  private async createDraftRecords(
    courierInvoiceId: string,
    normalized: { awbs: Partial<AWB>[] }
  ): Promise<void>
  // INSERT awbs with raw_line_data preserved, mark as needing review

  // Update OCR status
  async updateStatus(id: string, status: OCRStatus, data?: object): Promise<void>
}

// Factory function
export function createOCRPipeline(supabase: SupabaseClient): OCRPipeline

STEP 3: Create lib/logistics/ocr/providers/dhl-parser.ts

export class DHLParser {
  // DHL invoice PDF has predictable structure:
  // - AWB sections start with "Shipment" or AWB number pattern
  // - Each charge type has a specific label
  // - Totals appear at section end

  parse(rawText: string): ParsedCourierInvoice

  private extractAWBSections(text: string): string[]

  private parseAWBSection(section: string): ParsedAWB

  private extractAWBNumber(section: string): string | null
  // Regex: /\b\d{10,12}\b/ for DHL AWB numbers

  private extractCharges(section: string): ParsedAWBCharge[]
  // Regex patterns for:
  // - "Shipment Charge" or "Transportation Charge"
  // - "Fuel Surcharge" or "Energy Surcharge"
  // - "Demand Surcharge"
  // - "GoGreen"
  // - Weight/destination

  private calculateConfidence(awb: ParsedAWB): number
  // Higher confidence if: AWB number found, at least one charge found, total matches sum
}

// STUB — regex patterns are placeholders for now
// Full implementation comes when a real DHL PDF is available for testing

STEP 4: Create lib/logistics/ocr/normalizer.ts

export function normalizeInvoice(parsed: ParsedCourierInvoice): Partial<CourierInvoice>
export function normalizeAWBs(parsed: ParsedCourierInvoice, courierInvoiceId: string): Partial<AWB>[]
export function mapProviderToEnum(provider: string): CourierProvider

STEP 5: Add OCR trigger to CourierInvoiceForm.tsx (STUB only)

After file upload succeeds, add:
// OCR pipeline hook (future — uncomment when pipeline is ready)
// const pipeline = createOCRPipeline(supabase)
// await pipeline.processFile({ courierInvoiceId, filePath, fileType: 'pdf', provider })

Add a UI element in CourierInvoiceDetail.tsx showing OCR status:
- If ocr_status = 'none': show "Auto-extract AWBs (coming soon)" grayed-out button
- If ocr_status = 'done': show "AWBs extracted by AI — please verify" banner
- If ocr_status = 'failed': show "Auto-extraction failed — enter AWBs manually"

STEP 6: Create a future-readiness note
Create a file: lib/logistics/ocr/README.md documenting:
- How to implement the full pipeline when ready
- Which npm packages to install (pdf-parse, xlsx, @anthropic-ai/sdk)
- How to connect the Anthropic Vision API for scanned PDFs
- How to test parsers against real DHL invoice samples
- How to add new courier providers (FedEx, Aramex)

Requirements:
- ALL pipeline methods must have JSDoc explaining what they do and what TODO is needed
- The pipeline must compile cleanly even with stub implementations
- No new npm packages installed yet (all stubs return empty/mock data)
- OCR types must extend the existing logistics types correctly
- The architecture must make it easy to add a new courier provider parser

Run: npx tsc --noEmit
Fix any TypeScript errors.
Print: "OCR architecture prepared. Ready for implementation when DHL PDF samples are available."
```

---

## SUMMARY — Execution Order

Run these prompts in Claude Code **one at a time**, in order:

| # | Prompt | Est. Time | Production Risk |
|---|--------|-----------|-----------------|
| 1 | Schema & Migrations | 10 min | None (additive only) |
| 2 | TypeScript Types & Engine | 10 min | None (new files only) |
| 3 | Courier Invoice Upload UI | 20 min | Low (new pages only) |
| 4 | AWB Management | 20 min | Low |
| 5 | Allocation Engine UI | 25 min | Low |
| 6 | Invoice Generation | 20 min | Low |
| 7 | PDF Generation | 15 min | Low (client-side only) |
| 8 | Analytics Dashboard | 15 min | Low |
| 9 | Mobile UI Polish | 20 min | Low |
| 10 | OCR Architecture | 10 min | None (stubs only) |

**After Prompt 1**: Run `migration_v8_logistics.sql` in Supabase SQL Editor.
**After each prompt**: Run `npm run build` locally to verify no regressions.
**Deploy**: Each phase can deploy independently to Vercel without affecting existing finance features.

---

*Document version: 1.0 | Vaultr Logistics Module Architecture*
