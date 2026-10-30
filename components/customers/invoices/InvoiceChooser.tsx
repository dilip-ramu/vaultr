'use client'

// Invoices, as a question instead of a tab bar.
//
// This page used to open on "Couriers" — a batch screen — with the actual list
// of invoices two tabs away and a queue of expenses in between pretending to
// be invoices. Three different jobs behind one word, and no way to tell which
// tab did which until you were in it.
//
// So it asks. Three answers, each saying plainly what it makes and when to
// pick it, and each running the whole job through to an invoice rather than
// leaving you to find the next screen yourself.
//
// Underneath, a short list of what you made recently — because the second
// reason anybody opens this page is to find an invoice, and that should not
// require guessing which tab it lives on.

import Link from 'next/link'
import { Truck, Receipt, FileText, ArrowRight, Search } from 'lucide-react'
import { FLOWS, FLOW_ORDER, type FlowId } from '@/lib/customers/invoiceFlows'
import { inr } from '@/lib/assets/valuation'

const ICON: Record<FlowId, typeof Truck> = {
  courier: Truck,
  reimbursable: Receipt,
  direct: FileText,
}

export interface RecentInvoice {
  id: string
  invoice_number: string | null
  customer_name: string | null
  invoice_date: string | null
  total: number | null
  status: string | null
  invoice_type: 'tax_invoice' | 'reimbursement' | string
}

export default function InvoiceChooser({ recent }: { recent: RecentInvoice[] }) {
  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          Invoices
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          What are you making? Each one takes you all the way to the invoice.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {FLOW_ORDER.map(id => {
          const f = FLOWS[id]
          const Icon = ICON[id]
          return (
            <Link key={id} href={`/customers/invoices/${id}`}
              className="rounded-2xl p-5 flex flex-col gap-2 transition-colors"
              style={card}>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
                <Icon className="w-4.5 h-4.5" style={{ color: 'var(--brand)', width: 18, height: 18 }} />
              </span>

              <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{f.label}</p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.blurb}</p>

              <p className="text-[11.5px] leading-relaxed mt-auto pt-2" style={{ color: 'var(--text-faint)' }}>
                {f.when}
              </p>

              <span className="inline-flex items-center gap-1 text-[12.5px] font-bold mt-1"
                style={{ color: 'var(--brand)' }}>
                Start <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          )
        })}
      </div>

      {/* Finding one you already made. */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
            Recent invoices
          </p>
          <span className="flex items-center gap-4">
            <Link href="/customers/invoices/batches"
              className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
              Courier batches
            </Link>
            <Link href="/customers/invoices/list"
              className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
              <Search className="w-3.5 h-3.5" /> All invoices
            </Link>
          </span>
        </div>

        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            No invoices yet. Pick one of the three above to make your first.
          </p>
        ) : (
          recent.map((inv, i) => (
            <Link key={inv.id} href={`/customers/invoices/${inv.id}`}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="text-[12.5px] font-bold shrink-0 w-28 truncate" style={{ color: 'var(--text)' }}>
                {inv.invoice_number ?? '—'}
              </span>
              <span className="text-[12.5px] min-w-0 flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                {inv.customer_name ?? 'No customer'}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                {inv.invoice_type === 'reimbursement' ? 'Reimbursable' : 'Courier'}
              </span>
              <span className="text-[12.5px] font-bold shrink-0 tabular-nums" style={{ color: 'var(--text)' }}>
                {inr(Number(inv.total) || 0)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
