'use client'

import { useState } from 'react'
import { downloadRouteAsTextPdf } from '@/lib/pdf/downloadElementPdf'

/** Downloads a reimbursable invoice as a PDF using the new document design —
 *  renders the print route in a hidden iframe, captures it, and saves the file
 *  (no new tab, no react-pdf). */
export default function ReimbursableDownloadButton({
  invoiceId, invoiceNumber, label = 'PDF', className,
}: {
  invoiceId: string
  invoiceNumber?: string | null
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      await downloadRouteAsTextPdf(`/reimbursables/invoices/${invoiceId}/print`, `${invoiceNumber || 'Invoice'}.pdf`)
    } catch (e) {
      alert('Could not build the PDF (' + (e as Error).message + '). Try the print page instead.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button onClick={download} disabled={busy} className={className}>
      {busy ? 'Preparing PDF…' : label}
    </button>
  )
}
