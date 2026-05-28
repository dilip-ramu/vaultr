'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { SalarySlipDocument } from './SalarySlipPDF'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
  filename: string
}

export default function SalarySlipPDFDownload({ entry, month, employee, companyName, companyAddress, filename }: Props) {
  return (
    <PDFDownloadLink
      document={
        <SalarySlipDocument
          entry={entry}
          month={month}
          employee={employee}
          companyName={companyName}
          companyAddress={companyAddress}
        />
      }
      fileName={filename}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors no-underline"
    >
      {({ loading }) => loading ? 'Preparing PDF…' : '⬇ Download PDF'}
    </PDFDownloadLink>
  )
}
