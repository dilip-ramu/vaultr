'use client'

import { useState } from 'react'
import SalarySlip17a from './SalarySlip17a'
import LayoutRenderer from '@/components/templates/LayoutRenderer'
import type { SalarySlipDocData } from '@/lib/payroll/slip'
import type { DocLayout } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'
import { downloadElementPdf, findDocSheet } from '@/lib/pdf/downloadElementPdf'

/** Full-page print/download view for a salary slip. Owns the grey backdrop +
 *  Download button; renders the restyled SalarySlip17a. */
export default function SlipPrintView({
  data, logoUrl = null, signatureUrl = null, accent = '#1F5C3A', filename, layout = null, ctx = null,
}: {
  data: SalarySlipDocData
  logoUrl?: string | null
  signatureUrl?: string | null
  accent?: string
  filename: string
  layout?: DocLayout | null
  ctx?: LayoutContext | null
}) {
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
        .doc-btn.primary { background: ${accent}; }
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
      {layout && ctx
        ? <LayoutRenderer layout={layout} ctx={ctx} print />
        : <SalarySlip17a data={data} logoUrl={logoUrl} signatureUrl={signatureUrl} accent={accent} />}
    </>
  )
}
