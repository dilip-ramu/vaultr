'use client'

import { useState } from 'react'
import DocDesign from './DocDesign'
import type { DocModel } from '@/lib/documents/model'
import { downloadElementPdf, findDocSheet } from '@/lib/pdf/downloadElementPdf'

/** Full-page print/download view for a single document. Owns the grey backdrop
 *  + Download button; renders the unified DocDesign. */
export default function DocPrintView({ model, filename }: { model: DocModel; filename: string }) {
  const [busy, setBusy] = useState(false)
  async function downloadPdf() {
    const el = findDocSheet()
    if (!el) { window.print(); return }
    setBusy(true)
    try { await downloadElementPdf(el, filename) }
    catch (e) { alert('Could not build the PDF (' + (e as Error).message + '). Opening the print dialog — choose "Save as PDF".'); window.print() }
    finally { setBusy(false) }
  }
  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Manrope', system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .doc-actions { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; gap: 8px; }
        .doc-btn { color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .doc-btn.primary { background: ${model.accent || '#1F5C3A'}; }
        .doc-btn.ghost { background: #4b5563; }
        .doc-btn:hover { filter: brightness(0.92); }
        .doc-btn:disabled { opacity: 0.6; cursor: default; }
        @media print {
          .doc-actions { display: none !important; }
          body { background: #fff; }
          .vinv { padding: 0 !important; background: #fff !important; }
          .vinv .sheet { box-shadow: none !important; margin: 0 auto !important; }
        }
      `}</style>
      <div className="doc-actions">
        <button className="doc-btn primary" onClick={downloadPdf} disabled={busy}>{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button className="doc-btn ghost" onClick={() => window.print()}>Print</button>
      </div>
      <DocDesign model={model} />
    </>
  )
}
