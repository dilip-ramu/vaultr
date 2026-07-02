'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { SalarySlipDocument } from './SalarySlipPDF'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import type { InvoiceTemplate } from '@/lib/companies/templates'

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
  template?: InvoiceTemplate | string | null
  accent?: string | null
  filename: string
}

export default function SalarySlipPDFDownload({ entry, month, employee, companyName, companyAddress, template, accent, filename }: Props) {
  return (
    <PDFDownloadLink
      document={
        <SalarySlipDocument
          entry={entry}
          month={month}
          employee={employee}
          companyName={companyName}
          companyAddress={companyAddress}
          template={template}
          accent={accent}
        />
      }
      fileName={filename}
      className="px-4 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors no-underline"
    >
      {({ loading }) => loading ? 'Preparing PDF…' : '⬇ Download PDF'}
    </PDFDownloadLink>
  )
}
