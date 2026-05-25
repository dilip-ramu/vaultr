# OCR Pipeline — Implementation Guide

This directory contains the architecture for automatic courier invoice parsing.
The pipeline stubs are production-ready TypeScript; only the text-extraction
layer needs real libraries wired in.

---

## Directory layout

```
lib/logistics/ocr/
├── types.ts                  # ParsedAWB, ParsedCourierInvoice, OCRPipelineResult, etc.
├── pipeline.ts               # OCRPipeline class + createOCRPipeline() factory
├── normalizer.ts             # ParsedCourierInvoice → Partial<CourierInvoice|AWB>
├── providers/
│   └── dhl-parser.ts         # DHL regex parser (stub — regex tuning pending)
└── README.md                 # This file
```

---

## How to implement the full pipeline

### Step 1 — Install text-extraction packages

```bash
npm install pdf-parse xlsx
npm install -D @types/pdf-parse
```

For scanned (image-only) PDFs that have no embedded text layer:

```bash
npm install @anthropic-ai/sdk
```

### Step 2 — Implement `extractText()` in `pipeline.ts`

Replace the stub body with real extraction:

```typescript
private async extractText(filePath: string, fileType: string): Promise<string> {
  const { data, error } = await this.supabase.storage
    .from('vaultr-attachments')
    .download(filePath)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
  const buffer = Buffer.from(await data.arrayBuffer())

  if (fileType === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    // If text is very short (likely scanned), fall back to AI vision
    if (result.text.trim().length < 200) {
      return this.extractTextWithVision(buffer)
    }
    return result.text
  }

  if (fileType === 'excel') {
    const { read, utils } = await import('xlsx')
    const wb = read(buffer)
    return wb.SheetNames.map(name =>
      utils.sheet_to_csv(wb.Sheets[name])
    ).join('\n\n')
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}
```

### Step 3 — Connect Anthropic Vision API (for scanned PDFs)

Add a private method to `OCRPipeline`:

```typescript
private async extractTextWithVision(pdfBuffer: Buffer): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Convert first N pages to base64 images using a PDF-to-image library
  // then send to Claude's vision model with a structured extraction prompt
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '<page1_base64>' } },
        {
          type: 'text',
          text: `Extract all AWB data from this courier invoice as JSON.
                 Return: { invoiceNumber, invoiceDate, currency, totalAmount,
                 awbs: [{ awbNumber, charges: [{ label, amount }], destination }] }`,
        },
      ],
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

### Step 4 — Enable the pipeline in `CourierInvoiceForm.tsx`

Uncomment the OCR hook block that was added after file upload:

```typescript
// Find this in CourierInvoiceForm.tsx and uncomment:
if (filePath && fileType) {
  const { createOCRPipeline } = await import('@/lib/logistics/ocr/pipeline')
  const pipeline = createOCRPipeline(supabase)
  await pipeline.processFile({
    courierInvoiceId: invoice.id,
    filePath,
    fileType: fileType as 'pdf' | 'excel',
    provider: effectiveProvider,
  })
}
```

---

## Testing against real DHL invoice samples

1. Obtain a real DHL PDF invoice (anonymise customer data first).
2. Run `pdf-parse` on it and inspect `result.text` to see the actual layout.
3. Update the regex constants in `providers/dhl-parser.ts`:
   - `AWB_SECTION_SEPARATOR` — the pattern that separates AWB blocks
   - `CHARGE_PATTERNS` — map real label strings to field keys
4. Write a unit test: `lib/logistics/ocr/providers/__tests__/dhl-parser.test.ts`

```typescript
import { DHLParser } from '../dhl-parser'
import fs from 'fs'

const RAW_TEXT = fs.readFileSync('samples/dhl-invoice.txt', 'utf-8')

test('parses AWB numbers', () => {
  const parser = new DHLParser()
  const result = parser.parse(RAW_TEXT)
  expect(result.awbs.length).toBeGreaterThan(0)
  expect(result.awbs[0].awbNumber).toMatch(/^\d{10,12}$/)
})
```

---

## Adding a new courier provider (FedEx, Aramex, etc.)

1. Create `lib/logistics/ocr/providers/fedex-parser.ts` implementing `CourierParser`:

```typescript
import type { CourierParser, ParsedCourierInvoice } from '../types'

export class FedExParser implements CourierParser {
  readonly providerName = 'FedEx'
  parse(rawText: string): ParsedCourierInvoice { /* ... */ }
}
```

2. Register it in the `PARSERS` array in `pipeline.ts`:

```typescript
import { FedExParser } from './providers/fedex-parser'
const PARSERS: CourierParser[] = [new DHLParser(), new FedExParser()]
```

That's it — the pipeline routes to the correct parser automatically via `getParser()`.

---

## OCR status lifecycle

```
courier_invoices.ocr_status:

  none        — file not yet processed (default)
  queued      — processFile() called, waiting to start
  processing  — text extraction or parsing in progress
  done        — AWBs inserted as draft rows; user should verify
  failed      — pipeline error; user must enter AWBs manually
```

The UI in `CourierInvoiceDetailClient.tsx` already renders a banner for each state.

---

## Environment variables required

```env
ANTHROPIC_API_KEY=sk-ant-...   # Only needed for Vision API fallback
```
