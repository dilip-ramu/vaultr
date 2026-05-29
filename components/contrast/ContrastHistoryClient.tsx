'use client'

import dynamic from 'next/dynamic'
import { History, CheckCircle2, Clock, Download } from 'lucide-react'
import type { ContrastInvoiceData } from './ContrastInvoicePDF'

const ContrastInvoicePDFDownload = dynamic(() => import('./ContrastInvoicePDFDownload'), { ssr: false })

const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
}

function fmtDate(d: string) {
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

interface InvoiceItem {
  id: string
  item_type: 'salary' | 'courier' | 'expense'
  description: string
  salary_euro: number | null
  expended_rate: number | null
  amount_inr: number
  sort_order: number
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_month: string
  invoice_date: string
  status: 'draft' | 'finalized'
  subtotal: number
  gst_amount: number
  total: number
  notes: string | null
  finalized_at: string | null
  created_at: string
  items: InvoiceItem[]
}

export default function ContrastHistoryClient({ invoices }: { invoices: Invoice[] }) {
  const buildPdfData = (inv: Invoice): ContrastInvoiceData => ({
    invoice_number: inv.invoice_number,
    invoice_month: inv.invoice_month,
    invoice_date: inv.invoice_date,
    items: inv.items.sort((a, b) => a.sort_order - b.sort_order),
    subtotal: inv.subtotal,
    gst_amount: inv.gst_amount,
    total: inv.total,
  })

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <History className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoice History</h1>
          <p className="text-sm text-gray-500">All Contrast Company A/S proforma invoices</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-10 text-center">
          <History className="w-8 h-8 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No invoices generated yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {invoices.map(inv => (
              <div key={inv.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      inv.status === 'finalized' ? 'bg-green-100' : 'bg-amber-100'
                    }`}>
                      {inv.status === 'finalized'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <Clock className="w-4 h-4 text-amber-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">{monthLabel(inv.invoice_month)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold text-gray-900">{fmtInr(inv.total)}</p>
                      <p className="text-xs text-gray-400">incl. GST {fmtInr(inv.gst_amount)}</p>
                    </div>

                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      inv.status === 'finalized'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {inv.status === 'finalized' ? 'Finalized' : 'Draft'}
                    </span>

                    {inv.items.length > 0 && (
                      <ContrastInvoicePDFDownload
                        data={buildPdfData(inv)}
                        label="PDF"
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Line items preview */}
                {inv.items.length > 0 && (
                  <div className="mt-3 ml-11 space-y-1">
                    {inv.items
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .slice(0, 5)
                      .map(item => (
                        <div key={item.id} className="flex justify-between text-xs text-gray-500">
                          <span>{item.description}</span>
                          <span>{fmtInr(item.amount_inr)}</span>
                        </div>
                      ))
                    }
                    {inv.items.length > 5 && (
                      <p className="text-xs text-gray-400 italic">+{inv.items.length - 5} more lines</p>
                    )}
                    <div className="flex justify-between text-xs font-semibold text-gray-700 pt-1 border-t border-gray-100 mt-1">
                      <span>Sub Total</span>
                      <span>{fmtInr(inv.subtotal)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-2 ml-11 text-xs text-gray-400">
                  Created {fmtDate(inv.created_at.split('T')[0])}
                  {inv.finalized_at && ` · Finalized ${fmtDate(inv.finalized_at.split('T')[0])}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
