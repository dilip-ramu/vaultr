'use client'

import { useState } from 'react'
import DocDesign from './DocDesign'
import LayoutRenderer from '@/components/templates/LayoutRenderer'
import type { DocModel } from '@/lib/documents/model'
import type { DocLayout } from '@/lib/documents/layout'
import { modelToContext } from '@/lib/documents/layoutContext'
import { downloadElementPdf, findDocSheet } from '@/lib/pdf/downloadElementPdf'

/** Full-page print/download view for a single document. Renders the company's
 *  saved custom template when one exists, else the built-in DocDesign. */
export default function DocPrintView({ model, filename, layout = null }: { model: DocModel; filename: string; layout?: DocLayout | null }) {
  const [busy, setBusy] = useState(false)
  async function downloadPdf() {
    setBusy(true)
    try {
      // Text-based PDF drawn from the model — selectable text, one tap, no
      // rasterised whitespace. Falls back to the old screenshot method only if
      // this throws, so a download always happens.
      const { downloadDocModelPdf } = await import('@/lib/pdf/renderDocModelPdf')
      await downloadDocModelPdf(model, filename)
    } catch {
      try {
        const el = findDocSheet()
        if (el) await downloadElementPdf(el, filename)
        else window.print()
      } catch (e) {
        alert('Could not build the PDF (' + (e as Error).message + '). Opening the print dialog — choose "Save as PDF".')
        window.print()
      }
    } finally { setBusy(false) }
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
      {layout
        ? <LayoutRenderer layout={layout} ctx={modelToContext(model)} print />
        : <DocDesign model={model} />}
    </>
  )
}
