'use client'

import DocumentRenderer from '@/components/templates/DocumentRenderer'
import type { DocumentSchema } from '@/lib/templates/schema'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import type { InvoiceDocSettings } from '@/components/recoverables/invoices/InvoiceDocument'

interface Props {
  schema: DocumentSchema
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceDocSettings | null
  logoUrl?: string | null
}

/** Full-page print view for an issued document. Renders the assigned (or default)
 *  template via the shared DocumentRenderer, so print matches the template editor. */
export default function DocumentPrintView({ schema, invoice, lines, settings, logoUrl = null }: Props) {
  const accent = schema?.theme?.accent ?? '#2A7A50'
  return (
    <>
      <style>{`
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .print-btn { position: fixed; top: 16px; right: 16px; z-index: 100; background: ${accent}; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .print-btn:hover { filter: brightness(0.92); }
        @media print { .print-btn { display: none !important; } body { background: #fff; } }
      `}</style>
      <button className="print-btn" onClick={() => window.print()}>Print / Download PDF</button>
      <DocumentRenderer schema={schema} invoice={invoice} lines={lines} settings={settings} logoUrl={logoUrl} />
    </>
  )
}
