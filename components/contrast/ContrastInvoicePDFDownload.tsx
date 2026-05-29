'use client'

import dynamic from 'next/dynamic'
import type { ContrastInvoiceData } from './ContrastInvoicePDF'

interface Props {
  data: ContrastInvoiceData
  label?: string
  className?: string
}

// Load the entire PDF stack in ONE dynamic import.
// Previously PDFDownloadLink and ContrastInvoicePDF were separate dynamic
// imports — PDFDownloadLink could load first and receive ContrastInvoicePDF
// as null (still loading), causing @react-pdf/renderer to throw and crash
// the page. Combining them eliminates that race condition.
const PDFBundle = dynamic(
  async () => {
    const [{ PDFDownloadLink }, { default: ContrastInvoicePDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('./ContrastInvoicePDF'),
    ])

    function PDFDownloadWrapper({ data, label = 'Download PDF', className }: Props) {
      return (
        <PDFDownloadLink
          document={<ContrastInvoicePDF data={data} />}
          fileName={`${data.invoice_number}.pdf`}
          className={className}
        >
          {({ loading }: { loading: boolean }) => (loading ? 'Preparing PDF…' : label)}
        </PDFDownloadLink>
      )
    }

    return { default: PDFDownloadWrapper }
  },
  {
    ssr: false,
    loading: () => <span className="opacity-60 text-sm">Loading PDF…</span>,
  }
)

export default function ContrastInvoicePDFDownload(props: Props) {
  return <PDFBundle {...props} />
}
