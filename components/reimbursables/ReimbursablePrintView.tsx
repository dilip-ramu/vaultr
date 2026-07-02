'use client'

import DocumentRenderer from '@/components/templates/DocumentRenderer'
import type { DocumentSchema } from '@/lib/templates/schema'
import type { ReimbursableInvoiceData } from './ReimbursableInvoicePDF'

/** Full-page HTML print view for a reimbursement invoice rendered from a
 *  block-based template. Owns the print chrome; the document is
 *  DocumentRenderer (reimbursable branch). */
export default function ReimbursablePrintView({
  schema, data,
}: { schema: DocumentSchema; data: ReimbursableInvoiceData }) {
  const accent = schema.theme?.accent ?? '#2A7A50'
  return (
    <>
      <style>{`
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
        .print-btn { position: fixed; top: 16px; right: 16px; z-index: 100; background: ${accent}; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .print-btn:hover { filter: brightness(0.92); }
        @media print { .print-btn { display: none !important; } body { background: #fff; } }
      `}</style>
      <button className="print-btn" onClick={() => window.print()}>Print / Download PDF</button>
      <DocumentRenderer schema={schema} rdata={data} />
    </>
  )
}
