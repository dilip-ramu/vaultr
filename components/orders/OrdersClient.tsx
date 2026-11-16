'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, PackageSearch } from 'lucide-react'
import { stageMeta, isOpen, type OrderStage } from '@/lib/orders/stage'
import type { OrdersSummary } from '@/lib/orders/summary'
import {
  sortRows, filterRows, nextSort, turnover, isFiltering,
  type Sort, type SortKey, type Filters,
} from '@/lib/orders/listView'
import { ALL_STAGES, allowedStages } from '@/lib/orders/stage'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { notify } from '@/components/shared/Toast'
import { whenWords, countLate, type DateFlag } from '@/lib/orders/dates'

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
  /** The order value in rupees — what sorting and the totals use. */
  valueInr: number
  /** Invoiced to the customer so far, in rupees. */
  invoicedInr: number
  /** Net profit in rupees, and as a percentage of what was invoiced. */
  net: number
  marginPct: number
  /** True while any figure behind that profit is still an estimate. */
  estimated: boolean
  /** Cut-off / ETD worth saying something about. */
  flags: DateFlag[]
}

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
const fx = (n: number, c: string) =>
  c === 'INR' ? inr(n) : `${c} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)}`

const FLAG_TONE: Record<string, { bg: string; fg: string }> = {
  passed: { bg: '#FEE2E2', fg: '#991B1B' },
  soon:   { bg: '#FEF3C7', fg: '#92400E' },
  ok:     { bg: '#EEF0F2', fg: '#4B5563' },
}

/** Only the ones worth looking at. An ETD three weeks out is not news. */
function Flags({ flags, all = false }: { flags: DateFlag[]; all?: boolean }) {
  const show = all ? flags : flags.filter(f => f.state !== 'ok')
  if (!show.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {show.map(f => {
        const c = FLAG_TONE[f.state]
        return (
          <span key={f.kind} className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
            {f.label} {whenWords(f.daysAway)}
          </span>
        )
      })}
    </span>
  )
}

function Badge({ stage }: { stage: string }) {
  const m = stageMeta(stage)
  const c = BADGE[m.tone]
  return <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ background: c.bg, color: c.fg }}>{m.label}</span>
}

/**
 * Moving an order along without opening it.
 *
 * Only the moves the order is allowed to make are offered — allowedStages
 * decides, the same rule the order sheet follows, so the list cannot put an
 * order somewhere the sheet would refuse. The current stage is always in the
 * list, so the picker shows where it is rather than looking empty.
 */
function StagePicker({ o, busy, onMove }: {
  o: OrderListRow
  busy: boolean
  onMove: (id: string, next: string, was: string) => void
}) {
  const options = useMemo(() => {
    const allowed = allowedStages(o.stage) as string[]
    return allowed.includes(o.stage) ? allowed : [o.stage, ...allowed]
  }, [o.stage])

  return (
    <select
      value={o.stage}
      disabled={busy}
      onChange={e => { if (e.target.value !== o.stage) onMove(o.id, e.target.value, o.stage) }}
      aria-label={`Status of order ${o.number}`}
      className="px-2 py-1 rounded-lg border text-[12px] font-bold disabled:opacity-50"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      {options.map(k => <option key={k} value={k}>{stageMeta(k).label}</option>)}
    </select>
  )
}

/**
 * Profit, coloured, and labelled for what it actually is.
 *
 * Expected while anything behind it is still the costed figure rather than a
 * real one — a missing supplier bill, an invoice not yet raised. Actual once
 * they are all in. An unlabelled percentage reads as a fact, and that is how
 * an order with no bill against it came to show 100%.
 */
function Profit({ net, pct, estimated }: { net: number; pct: number; estimated: boolean }) {
  return (
    <span className="tabular-nums font-bold" style={{ color: net < 0 ? 'var(--expense)' : 'var(--income)' }}
      title={estimated
        ? 'Expected: some of this is still the figure you costed at, not a real invoice or bill.'
        : 'Actual: invoiced, billed and settled.'}>
      {estimated && <span style={{ color: 'var(--text-faint)' }}>~ </span>}
      {inr(net)}
      <span className="font-normal ml-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
      <span className="font-normal ml-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        {estimated ? 'expected' : 'actual'}
      </span>
    </span>
  )
}

/** One figure, said plainly. The strip is read at a glance, so no figure on
 *  it is allowed to need a second look to know whether it is good news. */
function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string
  tone?: 'plain' | 'good' | 'bad' | 'brand'
}) {
  const color = tone === 'good' ? 'var(--income)' : tone === 'bad' ? 'var(--expense)' : tone === 'brand' ? 'var(--brand)' : 'var(--text)'
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[19px] md:text-[21px] font-extrabold tabular-nums mt-1 leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}

export default function OrdersClient({ rows, summary }: { rows: OrderListRow[]; summary: OrdersSummary }) {
  const router = useRouter()
  const sb = createClient()
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [stages, setStages] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [saving, setSaving] = useState<string | null>(null)
  // The stage shown while a save is in flight, so the row changes the moment
  // you pick rather than when the server gets back to you.
  const [moved, setMoved] = useState<Record<string, string>>({})

  const filters: Filters = { search, stages, show }
  const withStage = useMemo(
    () => rows.map(r => (moved[r.id] ? { ...r, stage: moved[r.id] as OrderStage } : r)),
    [rows, moved])
  const list = useMemo(() => sortRows(filterRows(withStage, filters), sort),
    [withStage, search, stages, show, sort])
  const openCount = useMemo(() => withStage.filter(r => isOpen(r.stage)).length, [withStage])
  const late = useMemo(() => countLate(rows.map(r => r.flags)), [rows])
  // Turnover for what is on screen, so filtering to one customer answers
  // 'what have we billed them' without a second screen.
  const money = useMemo(() => turnover(list), [list])
  const filtered = isFiltering(filters)

  /** Moving an order along from the list. The row moves first and goes back
   *  if the save fails — nothing is worse than a status that only looks saved. */
  async function moveStage(id: string, next: string, was: string) {
    setMoved(m => ({ ...m, [id]: next }))
    setSaving(id)
    const { error } = await sb.from('orders').update({ stage: next }).eq('id', id)
    setSaving(null)
    if (error) {
      setMoved(m => ({ ...m, [id]: was }))
      notify(error.message, 'error')
      return
    }
    notify(`Moved to ${stageMeta(next).label}`, 'success')
    router.refresh()
  }

  const toggleStage = (k: string) =>
    setStages(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

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

      {/* ── The numbers you want walking in ──────────────────────────────
          Pending profit is a forecast and realised profit happened. They are
          never added together: doing that would flatter every month. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Open orders"
          value={String(summary.openCount)}
          sub={summary.openValue ? `${inr(summary.openValue)} on the books` : 'nothing running'}
          tone="brand" />
        <Tile
          label="Profit pending"
          value={inr(summary.pendingProfit)}
          sub={summary.openValue ? `${summary.openMarginPct.toFixed(1)}% on open orders` : 'on open orders'}
          tone={summary.pendingProfit < 0 ? 'bad' : 'plain'} />
        <Tile
          label="Profit realised"
          value={inr(summary.realisedProfit)}
          sub={`${summary.closedCount} order${summary.closedCount === 1 ? '' : 's'} closed`}
          tone={summary.realisedProfit < 0 ? 'bad' : 'good'} />
        <Tile
          label="Expected in the bank"
          value={inr(summary.netExpected)}
          sub="to come in, less what is owed"
          tone={summary.netExpected < 0 ? 'bad' : 'plain'} />
      </div>

      {/* Turnover for the orders IN VIEW, so filtering to one customer answers
          'what have we billed them' without another screen. Invoiced and not
          yet invoiced sit side by side rather than added together: calling
          the sum turnover counts work that has not been billed. */}
      <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Turnover {filtered ? `· ${money.count} order${money.count === 1 ? '' : 's'} shown` : show === 'open' ? '· open orders' : '· all orders'}
        </span>
        <span>Invoiced <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(money.invoicedInr)}</b></span>
        <span>Not yet invoiced <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(money.uninvoicedInr)}</b></span>
        <span>Order book <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(money.totalInr)}</b></span>
      </div>

      <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
        <span>To collect <b className="tabular-nums" style={{ color: 'var(--income)' }}>{inr(summary.receivable)}</b></span>
        <span>To pay <b className="tabular-nums" style={{ color: 'var(--expense)' }}>{inr(summary.payable)}</b></span>
        {summary.drawbackDue > 0 && <span>Drawback awaited <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(summary.drawbackDue)}</b></span>}
        {summary.toShip > 0 && <span>Still to ship <b className="tabular-nums" style={{ color: 'var(--text)' }}>{summary.toShip.toLocaleString('en-IN')} pcs</b></span>}
        {late.passed > 0 && <span style={{ color: 'var(--expense)' }}><b>{late.passed}</b> past a date</span>}
        {late.soon > 0 && <span style={{ color: '#92400E' }}><b>{late.soon}</b> due within a week</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex gap-1.5">
          {([['open', `Open (${openCount})`], ['all', `All (${rows.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setShow(k)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
              style={show === k && stages.length === 0
                ? { background: 'var(--brand-light)', color: 'var(--brand)' }
                : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {label}
            </button>
          ))}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Order, customer or their PO"
          className="px-3 py-1.5 rounded-lg border text-[13px] min-w-[220px] flex-1 md:flex-none md:w-72"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />

        {/* Picking a stage overrides the Open/All switch, so asking for
            'cancelled' shows them rather than nothing. */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_STAGES.map(k => {
            const on = stages.includes(k)
            return (
              <button key={k} onClick={() => toggleStage(k)}
                className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold"
                style={on
                  ? { background: 'var(--brand-light)', color: 'var(--brand)' }
                  : { background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                {stageMeta(k).label}
              </button>
            )
          })}
        </div>

        {filtered && (
          <button onClick={() => { setSearch(''); setStages([]) }}
            className="text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
            Clear
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <PackageSearch className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>
            {rows.length === 0 ? 'No orders yet' : filtered ? 'Nothing matches' : 'Nothing open'}
          </p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {rows.length === 0 ? 'Start one when a customer sends you a PO.'
              : filtered ? 'Clear the search or the status filter to see the rest.'
              : 'Switch to All to see the finished ones.'}
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
                    <div className="mt-1"><Flags flags={o.flags} /></div>
                    {/* The picker is inside a Link on the phone card, so its
                        own clicks must not navigate away. */}
                    <div className="mt-1.5" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                      <StagePicker o={o} busy={saving === o.id} onMove={moveStage} />
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
                {([
                  ['Order', 'number'], ['Customer', 'customer'], ['Their PO', 'po'],
                  ['Dates', 'date'], ['Status', 'stage'], ['Value', 'value'], ['Profit', 'profit'],
                ] as [string, SortKey][]).map(([h, key], i) => {
                  const on = sort.key === key
                  return (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide ${i >= 5 ? 'text-right' : 'text-left'}`}
                      style={{ color: on ? 'var(--brand)' : 'var(--text-muted)' }}>
                      <button onClick={() => setSort(sr => nextSort(sr, key))}
                        className="inline-flex items-center gap-1 uppercase tracking-wide"
                        title={`Sort by ${h.toLowerCase()}`}>
                        {h}
                        <span style={{ color: on ? 'var(--brand)' : 'var(--text-faint)' }}>
                          {on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </th>
                  )
                })}
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
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                      {o.flags.length ? <Flags flags={o.flags} all /> : o.order_date}
                    </td>
                    <td className="px-4 py-2.5"><StagePicker o={o} busy={saving === o.id} onMove={moveStage} /></td>
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
