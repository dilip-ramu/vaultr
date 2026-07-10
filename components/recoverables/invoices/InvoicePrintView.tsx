'use client'

import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import { type InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT } from '@/lib/companies/templates'
import InvoiceDocument, { type InvoiceDocSettings } from './InvoiceDocument'
import DocumentRenderer from '@/components/templates/DocumentRenderer'
import type { DocumentSchema } from '@/lib/templates/schema'
import { downloadElementPdf, findDocSheet } from '@/lib/pdf/downloadElementPdf'
import { useState } from 'react'

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
  // Claude-design invoices always use the built-in 16a layout (InvoiceDocument),
  // never a custom block template — the new design is the whole point.
  const useClaude = invoice.design_version === 'claude'
  const effectiveSchema = useClaude ? null : schema
  const btnAccent = effectiveSchema?.theme?.accent ?? accent
  const [busy, setBusy] = useState(false)
  async function downloadPdf() {
    const el = findDocSheet()
    if (!el) { window.print(); return }
    setBusy(true)
    try { await downloadElementPdf(el, `${invoice.invoice_number || 'Invoice'}.pdf`) }
    catch (e) { alert('Could not build the PDF automatically (' + (e as Error).message + '). Opening the print dialog — choose "Save as PDF".'); window.print() }
    finally { setBusy(false) }
  }
  return (
    <>
      <style>{`
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .doc-actions { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; gap: 8px; }
        .doc-btn { color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .doc-btn.primary { background: ${btnAccent}; }
        .doc-btn.ghost { background: #4b5563; }
        .doc-btn:hover { filter: brightness(0.92); }
        .doc-btn:disabled { opacity: 0.6; cursor: default; }
        @media print {
          .doc-actions { display: none !important; }
          body { background: #fff; }
          .vinv .sheet { box-shadow: none !important; margin: 0 auto !important; }
        }
      `}</style>

      <div className="doc-actions">
        <button className="doc-btn primary" onClick={downloadPdf} disabled={busy}>{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button className="doc-btn ghost" onClick={() => window.print()}>Print</button>
      </div>

      {effectiveSchema ? (
        <DocumentRenderer
          schema={effectiveSchema}
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
