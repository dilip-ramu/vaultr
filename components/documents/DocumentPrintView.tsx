'use client'

import { useState } from 'react'
import DocumentRenderer from '@/components/templates/DocumentRenderer'
import type { DocumentSchema } from '@/lib/templates/schema'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import type { InvoiceDocSettings } from '@/components/recoverables/invoices/InvoiceDocument'
import { downloadElementPdf, findDocSheet } from '@/lib/pdf/downloadElementPdf'

interface Props {
  schema: DocumentSchema
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceDocSettings | null
  logoUrl?: string | null
  signatureUrl?: string | null
}

/** Full-page print view for an issued document. Renders the assigned (or default)
 *  template via the shared DocumentRenderer, so print matches the template editor. */
export default function DocumentPrintView({ schema, invoice, lines, settings, logoUrl = null, signatureUrl = null }: Props) {
  const accent = schema?.theme?.accent ?? '#2A7A50'
  const [busy, setBusy] = useState(false)
  async function downloadPdf() {
    const el = findDocSheet()
    if (!el) { window.print(); return }
    setBusy(true)
    try { await downloadElementPdf(el, `${invoice.invoice_number || 'Document'}.pdf`) }
    catch (e) { alert('Could not build the PDF automatically (' + (e as Error).message + '). Opening the print dialog — choose "Save as PDF".'); window.print() }
    finally { setBusy(false) }
  }
  return (
    <>
      <style>{`
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .doc-actions { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; gap: 8px; }
        .doc-btn { color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .doc-btn.primary { background: ${accent}; }
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
      <DocumentRenderer schema={schema} invoice={invoice} lines={lines} settings={settings} logoUrl={logoUrl} signatureUrl={signatureUrl} />
    </>
  )
}
