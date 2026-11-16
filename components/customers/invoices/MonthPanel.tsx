'use client'

// The month, at the top of the invoices page.
//
// Billing happens once a month, so nobody arrives here remembering where they
// got to. The page used to open on a question — "what are you making?" — when
// the app already held the answer: consignments imported and not billed,
// expenses paid on a customer's behalf and not sorted, and what went out last
// month to compare against.
//
// So this reads the job back. One row per customer, what is waiting on each,
// and a link straight into the flow that clears it with the customer already
// chosen. The three cards below still exist for the times none of this
// applies — a one-off plain invoice.
//
// The arithmetic is in lib/customers/invoiceMonth.ts and tested there.

import Link from 'next/link'
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { inr } from '@/lib/assets/valuation'
import {
  monthLabel, waitingWords, type WaitingRow, type MonthSummary,
} from '@/lib/customers/invoiceMonth'

export interface MonthPanelProps {
  month: string
  rows: WaitingRow[]
  now: MonthSummary
  before: MonthSummary
  comparison: string
}

/** Where a row's work gets done, with the customer already picked. */
function rowHref(row: WaitingRow): string {
  if (row.action === 'reimbursable') {
    // The reimbursable flow addresses a customer by id, and starts on the
    // sorting step only when there is something left to sort.
    const q = new URLSearchParams()
    if (row.customerId) q.set('customer', row.customerId)
    if (row.expensesUnsorted === 0) q.set('step', 'build')
    const qs = q.toString()
    return `/customers/invoices/reimbursable${qs ? `?${qs}` : ''}`
  }
  // The courier flow addresses a customer by name, and the consignments are
  // already imported, so it opens on the invoice itself.
  const q = new URLSearchParams({ step: 'build' })
  if (row.customerName) q.set('customer', row.customerName)
  return `/customers/invoices/courier?${q.toString()}`
}

export default function MonthPanel({ month, rows, now, before, comparison }: MonthPanelProps) {
  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const waitingTotal = rows.reduce((t, r) => t + r.consignmentValue + r.expenseValue, 0)

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
            {monthLabel(month)}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {comparison}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span>Invoiced <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(now.total)}</b></span>
          {now.outstanding > 0 && (
            <span>Still owed <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(now.outstanding)}</b></span>
          )}
          {now.overdue > 0 && (
            <span style={{ color: 'var(--expense)' }}>
              <b className="tabular-nums">{now.overdue}</b> past due
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--income)' }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
              Nothing waiting to be invoiced.
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              No consignments left to bill and no expenses left to sort. A one-off bill still
              starts from one of the three below.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>
              Waiting to be invoiced
            </p>
            <p className="text-[12px] tabular-nums font-bold" style={{ color: 'var(--text-muted)' }}>
              {inr(Math.round(waitingTotal * 100) / 100)}
            </p>
          </div>

          {rows.map((row, i) => (
            <Link key={`${row.customerName}-${i}`} href={rowHref(row)}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="text-[13px] truncate" style={{ color: 'var(--text)' }}>{row.customerName}</b>
                  {/* Said out loud, because a customer already invoiced this
                      month with consignments still waiting is the case that
                      gets missed. */}
                  {row.invoicedThisMonth > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ color: 'var(--amber)', border: '1px solid var(--border)' }}>
                      <AlertCircle className="w-3 h-3" />
                      {row.invoicedThisMonth === 1 ? 'already invoiced this month' : `${row.invoicedThisMonth} already this month`}
                    </span>
                  )}
                </span>
                <span className="block text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {waitingWords(row)}
                </span>
              </span>
              <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>
                {inr(Math.round((row.consignmentValue + row.expenseValue) * 100) / 100)}
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] font-bold shrink-0" style={{ color: 'var(--brand)' }}>
                {row.action === 'reimbursable'
                  ? (row.expensesUnsorted > 0 ? 'Sort' : 'Invoice')
                  : 'Invoice'}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  )
}
