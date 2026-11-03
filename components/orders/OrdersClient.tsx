'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, PackageSearch } from 'lucide-react'
import { stageMeta, isOpen, type OrderStage } from '@/lib/orders/stage'

const BADGE: Record<string, { bg: string; fg: string }> = {
  grey:   { bg: '#EEF0F2', fg: '#4B5563' },
  amber:  { bg: '#FEF3C7', fg: '#92400E' },
  blue:   { bg: '#DBEAFE', fg: '#1E40AF' },
  violet: { bg: '#EDE9FE', fg: '#5B21B6' },
  green:  { bg: '#DCFCE7', fg: '#14532D' },
}

export interface OrderListRow {
  id: string
  number: string
  customer_name: string
  customer_po_no: string | null
  order_date: string
  stage: OrderStage
  currency: string
  /** Order currency. */
  value: number
  /** Net profit in rupees, and as a percentage of what was invoiced. */
  net: number
  marginPct: number
  /** True while any figure behind that profit is still an estimate. */
  estimated: boolean
}

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
const fx = (n: number, c: string) =>
  c === 'INR' ? inr(n) : `${c} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)}`

function Badge({ stage }: { stage: string }) {
  const m = stageMeta(stage)
  const c = BADGE[m.tone]
  return <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ background: c.bg, color: c.fg }}>{m.label}</span>
}

/** Profit, coloured, with a mark when it is still partly a guess. */
function Profit({ net, pct, estimated }: { net: number; pct: number; estimated: boolean }) {
  return (
    <span className="tabular-nums font-bold" style={{ color: net < 0 ? 'var(--expense)' : 'var(--income)' }}>
      {estimated && <span style={{ color: 'var(--text-faint)' }}>~ </span>}
      {inr(net)}
      <span className="font-normal ml-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
    </span>
  )
}

export default function OrdersClient({ rows }: { rows: OrderListRow[] }) {
  const [show, setShow] = useState<'open' | 'all'>('open')
  const list = useMemo(() => (show === 'open' ? rows.filter(r => isOpen(r.stage)) : rows), [rows, show])
  const openCount = useMemo(() => rows.filter(r => isOpen(r.stage)).length, [rows])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Orders</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            One per customer PO. Every sales order, purchase order, invoice and bill for the job hangs off it.
          </p>
        </div>
        <Link href="/orders/new" className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> New order
        </Link>
      </div>

      <div className="flex gap-1.5">
        {([['open', `Open (${openCount})`], ['all', `All (${rows.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setShow(k)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
            style={show === k
              ? { background: 'var(--brand-light)', color: 'var(--brand)' }
              : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <PackageSearch className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>
            {rows.length === 0 ? 'No orders yet' : 'Nothing open'}
          </p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {rows.length === 0 ? 'Start one when a customer sends you a PO.' : 'Switch to All to see the finished ones.'}
          </p>
          {rows.length === 0 && <Link href="/orders/new" className="text-sm mt-2 inline-block font-semibold" style={{ color: 'var(--brand)' }}>Create the first one →</Link>}
        </div>
      ) : (
        <>
          {/* Phone: one card each. Six columns will not fit a phone, and
              truncating the customer name is worse than stacking. */}
          <div className="md:hidden space-y-2">
            {list.map(o => (
              <Link key={o.id} href={`/orders/${o.id}`} className="block rounded-2xl border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[15px] truncate" style={{ color: 'var(--text)' }}>{o.number}</span>
                      <Badge stage={o.stage} />
                    </div>
                    <div className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text)' }}>{o.customer_name}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {o.customer_po_no ? `Their PO ${o.customer_po_no} · ` : ''}{o.order_date}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{fx(o.value, o.currency)}</div>
                    <div className="mt-0.5 text-[13px]"><Profit net={o.net} pct={o.marginPct} estimated={o.estimated} /></div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-2)' }}>
                {['Order', 'Customer', 'Their PO', 'Date', 'Value', 'Profit'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide ${i >= 4 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {list.map(o => (
                  <tr key={o.id} className="hover:bg-[var(--surface-2)]" style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>
                      <Link href={`/orders/${o.id}`} className="inline-flex items-center gap-2">
                        {o.number}<Badge stage={o.stage} />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{o.customer_name}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{o.customer_po_no || '—'}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{o.order_date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fx(o.value, o.currency)}</td>
                    <td className="px-4 py-2.5 text-right"><Profit net={o.net} pct={o.marginPct} estimated={o.estimated} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            ~ means the profit still has estimates in it — a bill or the bank rate has not arrived yet.
          </p>
        </>
      )}
    </div>
  )
}
