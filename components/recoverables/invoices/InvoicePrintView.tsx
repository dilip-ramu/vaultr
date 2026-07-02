'use client'

import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import { type InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT } from '@/lib/companies/templates'
import InvoiceDocument, { type InvoiceDocSettings } from './InvoiceDocument'
import DocumentRenderer from '@/components/templates/DocumentRenderer'
import type { DocumentSchema } from '@/lib/templates/schema'

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceDocSettings | null
  logoUrl?: string | null
  signatureUrl?: string | null
  template?: InvoiceTemplate
  accent?: string
  /** When set, a custom block-based template is rendered instead of the
   *  built-in InvoiceDocument layout. */
  schema?: DocumentSchema | null
}

/** Full-page print view for the isolated print route. Owns the page chrome
 *  (grey backdrop + Print button). The document is either the built-in
 *  InvoiceDocument or, when a custom template is assigned, DocumentRenderer —
 *  both share the on-screen preview markup so print matches the editor. */
export default function InvoicePrintView({
  invoice, lines, settings,
  logoUrl = null, signatureUrl = null,
  template = DEFAULT_INVOICE_TEMPLATE,
  accent = DEFAULT_INVOICE_ACCENT,
  schema = null,
}: Props) {
  const btnAccent = schema?.theme?.accent ?? accent
  return (
    <>
      <style>{`
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .print-btn { position: fixed; top: 16px; right: 16px; z-index: 100; background: ${btnAccent}; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .print-btn:hover { filter: brightness(0.92); }
        @media print { .print-btn { display: none !important; } body { background: #fff; } }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        Print / Download PDF
      </button>

      {schema ? (
        <DocumentRenderer
          schema={schema}
          invoice={invoice}
          lines={lines}
          settings={settings}
          logoUrl={logoUrl}
          signatureUrl={signatureUrl}
        />
      ) : (
        <InvoiceDocument
          invoice={invoice}
          lines={lines}
          settings={settings}
          logoUrl={logoUrl}
          signatureUrl={signatureUrl}
          template={template}
          accent={accent}
        />
      )}
    </>
  )
}
