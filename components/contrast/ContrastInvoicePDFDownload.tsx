'use client'

import dynamic from 'next/dynamic'
import type { ContrastInvoiceData } from './ContrastInvoicePDF'

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
  { ssr: false }
)
const ContrastInvoicePDF = dynamic(
  () => import('./ContrastInvoicePDF'),
  { ssr: false }
)

interface Props {
  data: ContrastInvoiceData
  label?: string
  className?: string
}

export default function ContrastInvoicePDFDownload({ data, label = 'Download PDF', className }: Props) {
  return (
    <PDFDownloadLink
      document={<ContrastInvoicePDF data={data} />}
      fileName={`${data.invoice_number}.pdf`}
      className={className}
    >
      {({ loading }) => (loading ? 'Preparing PDF…' : label)}
    </PDFDownloadLink>
  )
}
