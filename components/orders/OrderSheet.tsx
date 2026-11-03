'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Pencil, Plus, Trash2, Link2, Unlink, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import {
  computeMargin, plannedFromLines, shipmentProgress,
  type CostLine,
} from '@/lib/orders/margin'
import { stageMeta, allowedStages, suggestedStage, OPEN_STAGES, stageIndex } from '@/lib/orders/stage'
import { formatSizes, lineShipped, type SizeRow } from '@/lib/orders/sizes'
import type { OrderFacts, StepKey } from '@/lib/orders/flow'
import type { SummaryInput } from '@/lib/orders/summaryDoc'
import OrderStepRail from './OrderStepRail'
import OrderFilesPanel, { type OrderFileRow } from './OrderFilesPanel'
import SupplierPackButton from './SupplierPackButton'

// ── Shapes the page hands down ──────────────────────────────────────────────

export interface OrderRow {
  id: string; number: string; customer_name: string
  customer_po_no: string | null; customer_po_date: string | null
  order_date: string; stage: string
  currency: string; booked_rate: number; realised_rate: number | null
  drawback_basis: 'percent' | 'amount' | null; drawback_value: number
  drawback_actual: number | null; drawback_expected_date: string | null; drawback_received_date: string | null
  notes: string | null; closed_at: string | null
}
export interface LineRow {
  id: string; item: string; description: string | null
  qty: number; sell_rate: number; cost_rate: number; shipped_qty: number
  sizes: SizeRow[]
}
export interface CostRow { id: string; name: string; sign: number; basis: CostLine['basis']; planned: number; actual: number | null }
export interface DocRow { id: string; doc_type: string; number: string; date: string; total: number }
export interface CustInvRow { id: string; invoice_number: string; invoice_date: string; total: number; currency: string; status: string }
export interface BillRow { id: string; invoice_number: string | null; invoice_date: string; amount: number; currency: string; is_paid: boolean }

interface Props {
  order: OrderRow
  lines: LineRow[]
  costs: CostRow[]
  docs: DocRow[]
  custInvoices: CustInvRow[]
  bills: BillRow[]
  freeSellDocs: DocRow[]
  freeBuyDocs: DocRow[]
  freeCustInvoices: CustInvRow[]
  freeBills: BillRow[]
  files: OrderFileRow[]
  /** Everything the supplier-pack summary page needs, built server-side. */
  summary: SummaryInput
  /** The purchase order raised for this order, if there is one. */
  po: { id: string; number: string; supplierName: string | null } | null
}

const DOC_LABEL: Record<string, string> = {
  quotation: 'Quotation', proforma_gst: 'Proforma', sales_order: 'Sales order',
  delivery_challan: 'Delivery challan', credit_note: 'Credit note',
  purchase_order: 'Purchase order', debit_note: 'Debit note',
}
const BADGE: Record<string, { bg: string; fg: string }> = {
  grey: { bg: '#EEF0F2', fg: '#4B5563' }, amber: { bg: '#FEF3C7', fg: '#92400E' },
  blue: { bg: '#DBEAFE', fg: '#1E40AF' }, violet: { bg: '#EDE9FE', fg: '#5B21B6' },
  green: { bg: '#DCFCE7', fg: '#14532D' },
}

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
/** Negative money reads as −₹12,000, never ₹-12,000. */
const sInr = (n: number) => (n < 0 ? '−' : '') + inr(Math.abs(n))
const inr0 = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
const money = (n: number, c: string) => c === 'INR' ? inr(n) : `${c} ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`
const num = (v: string) => parseFloat(v) || 0

const card = { borderColor: 'var(--border)', background: 'var(--surface)' }
const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
const iCls = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'

export default function OrderSheet(p: Props) {
  const router = useRouter()
  const sb = createClient()
  const { order } = p
  const locked = order.stage === 'closed'
  const isExport = order.currency !== 'INR'

  const [stage, setStage] = useState(order.stage)
  const [realisedRate, setRealisedRate] = useState(order.realised_rate == null ? '' : String(order.realised_rate))
  const [drawbackActual, setDrawbackActual] = useState(order.drawback_actual == null ? '' : String(order.drawback_actual))
  const [costs, setCosts] = useState<CostRow[]>(p.costs)
  const [lines, setLines] = useState<LineRow[]>(p.lines)
  const [busy, setBusy] = useState(false)

  // ── The sheet ─────────────────────────────────────────────────────────────
  const planned = useMemo(
    () => plannedFromLines(lines.map(l => ({ qty: l.qty, sellRate: l.sell_rate, costRate: l.cost_rate }))),
    [lines])

  const actualCustomerValue = useMemo(() => p.custInvoices.reduce((t, i) => t + Number(i.total || 0), 0), [p.custInvoices])
  const actualSupplierCost = useMemo(() => p.bills.reduce((t, b) => t + Number(b.amount || 0), 0), [p.bills])

  // An invoice in another currency cannot be added to this total without
  // silently inventing a rate, so it is called out instead of absorbed.
  const oddCurrency = useMemo(() => [
    ...p.custInvoices.filter(i => (i.currency || 'INR') !== order.currency).map(i => i.invoice_number),
    ...p.bills.filter(b => (b.currency || 'INR') !== 'INR').map(b => b.invoice_number ?? 'bill'),
  ], [p.custInvoices, p.bills, order.currency])

  const margin = useMemo(() => computeMargin({
    customerValuePlanned: planned.customerValue,
    customerValueActual: actualCustomerValue,
    bookedRate: Number(order.booked_rate) || 1,
    realisedRate: realisedRate === '' ? null : num(realisedRate),
    supplierCostPlanned: planned.supplierCost,
    supplierCostActual: actualSupplierCost,
    drawback: order.drawback_basis
      ? { basis: order.drawback_basis, value: Number(order.drawback_value) || 0, actual: drawbackActual === '' ? null : num(drawbackActual) }
      : null,
    costs: costs.map(c => ({ name: c.name, sign: c.sign === 1 ? 1 : -1, basis: c.basis, planned: Number(c.planned) || 0, actual: c.actual })),
  }), [planned, actualCustomerValue, actualSupplierCost, order, realisedRate, drawbackActual, costs])

  const ship = useMemo(() => shipmentProgress(lines.map(l => ({
    qty: l.qty, sellRate: l.sell_rate, costRate: l.cost_rate,
    shippedQty: lineShipped(l.shipped_qty, l.sizes),
  }))), [lines])

  const suggestion = suggestedStage(stage, {
    hasSalesOrder: p.docs.some(d => d.doc_type === 'sales_order'),
    hasPurchaseOrder: p.docs.some(d => d.doc_type === 'purchase_order'),
    hasShipped: ship.shipped > 0 || p.docs.some(d => d.doc_type === 'delivery_challan'),
    hasCustomerInvoice: p.custInvoices.length > 0,
  })

  // ── The flow ──────────────────────────────────────────────────────────────
  const customerFiles = p.files.filter(f => f.side === 'customer')
  const supplierFiles = p.files.filter(f => f.side === 'supplier')
  const facts: OrderFacts = {
    customerFiles: customerFiles.length,
    supplierFiles: supplierFiles.length,
    hasSalesOrder: p.docs.some(d => d.doc_type === 'sales_order'),
    hasPurchaseOrder: p.docs.some(d => d.doc_type === 'purchase_order'),
    costAgreed: planned.supplierCost > 0,
    costsEntered: costs.length > 0,
    hasCustomerInvoice: p.custInvoices.length > 0,
    closed: locked,
  }
  const hrefs: Partial<Record<StepKey, string>> = locked ? {} : {
    sales_order: `/customers/documents/sales_order/new?fromOrder=${order.id}`,
    purchase_order: `/suppliers/documents/purchase_order/new?fromOrder=${order.id}`,
    // The invoice builder has its own line model and is not prefilled from an
    // order yet, so this takes you there and you attach it back below. Saying
    // so on the step is better than a parameter that silently does nothing.
    invoice: '/customers/invoices/direct',
  }
  function onStep(key: StepKey) {
    const id = key === 'files' ? 'order-files' : key === 'pl' ? 'order-pl' : null
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  async function patch(fields: Record<string, unknown>) {
    const { error } = await sb.from('orders').update(fields).eq('id', order.id)
    if (error) { notify(error.message, 'error'); return false }
    return true
  }

  async function changeStage(next: string) {
    const was = stage
    setStage(next)
    if (!await patch({ stage: next })) { setStage(was); return }
    notify(`Moved to ${stageMeta(next).label}`, 'success')
    router.refresh()
  }

  async function saveCost(c: CostRow, patchFields: Partial<CostRow>) {
    setCosts(prev => prev.map(x => x.id === c.id ? { ...x, ...patchFields } : x))
    const { error } = await sb.from('order_costs').update(patchFields).eq('id', c.id)
    if (error) notify(error.message, 'error')
  }

  async function addCost() {
    setBusy(true)
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data, error } = await sb.from('order_costs')
        .insert({ order_id: order.id, user_id: user.id, line_number: costs.length + 1, name: '', sign: -1, basis: 'flat', planned: 0 })
        .select('*').single()
      if (error || !data) { notify(error?.message ?? 'Could not add', 'error'); return }
      setCosts(prev => [...prev, data as CostRow])
    } finally { setBusy(false) }
  }

  async function saveShipped(l: LineRow, value: number) {
    const capped = Math.max(0, Math.min(value, l.qty))
    setLines(prev => prev.map(x => x.id === l.id ? { ...x, shipped_qty: capped } : x))
    const { error } = await sb.from('order_lines').update({ shipped_qty: capped }).eq('id', l.id)
    if (error) notify(error.message, 'error')
  }

  async function removeCost(c: CostRow) {
    setCosts(prev => prev.filter(x => x.id !== c.id))
    const { error } = await sb.from('order_costs').delete().eq('id', c.id)
    if (error) notify(error.message, 'error')
  }

  async function link(table: string, id: string, orderId: string | null) {
    setBusy(true)
    try {
      const { error } = await sb.from(table).update({ order_id: orderId }).eq('id', id)
      if (error) { notify(error.message, 'error'); return }
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/orders" className="w-9 h-9 mt-0.5 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><ChevronLeft className="w-4 h-4" /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{order.number}</h1>
              {(() => { const m = stageMeta(stage); const c = BADGE[m.tone]; return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>{m.label}</span> })()}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {order.customer_name}
              {order.customer_po_no && <> · their PO <b style={{ color: 'var(--text)' }}>{order.customer_po_no}</b></>}
              {order.customer_po_date && <> dated {order.customer_po_date}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <select value={stage} onChange={e => changeStage(e.target.value)} className="px-3 py-2 rounded-xl border text-sm font-semibold" style={iStyle}>
              {allowedStages(stage).map(s => <option key={s} value={s}>{stageMeta(s).label}</option>)}
            </select>
          )}
          <Link href={`/orders/${order.id}/edit`} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><Pencil className="w-4 h-4" /> Edit</Link>
        </div>
      </div>

      {suggestion && (
        <div className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[13px]" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
          <span>The paperwork has reached <b>{stageMeta(suggestion).label}</b>. Move this order on?</span>
          <button onClick={() => changeStage(suggestion)} className="font-bold underline">Move to {stageMeta(suggestion).label}</button>
        </div>
      )}

      <OrderStepRail facts={facts} hrefs={hrefs} onAction={onStep} />

      {locked && (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: '#DCFCE7', color: '#14532D' }}>
          This order is closed and the sheet is locked{order.closed_at ? ` (${order.closed_at.slice(0, 10)})` : ''}.
        </div>
      )}

      {/* ── Progress ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-4" style={card}>
        <div className="flex items-center justify-between text-[12px] mb-2" style={{ color: 'var(--text-muted)' }}>
          <span>{OPEN_STAGES.map(s => stageMeta(s).label).join(' → ')}</span>
          <span>{ship.shipped.toLocaleString('en-IN')} of {ship.ordered.toLocaleString('en-IN')} shipped{ship.balance > 0 ? ` · ${ship.balance.toLocaleString('en-IN')} to go` : ''}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, (Math.max(stageIndex(stage), 0) / 5) * 100)}%`, background: 'var(--brand)' }} />
        </div>
      </div>

      {oddCurrency.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-2 text-[13px]" style={{ background: '#FEF3C7', color: '#92400E' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{oddCurrency.join(', ')} {oddCurrency.length === 1 ? 'is' : 'are'} in a different currency to this order, so the Actual column adds them up as if they were not. Fix the currency on them, or keep that in mind when reading the profit.</span>
        </div>
      )}

      {/* ── What was ordered ────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={card}>
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>What was ordered</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Type into Shipped as goods go out. Part shipments are expected — the balance is what is still to come.
            </p>
          </div>
          <Link href={`/orders/${order.id}/edit`} className="text-[12px] font-bold" style={{ color: 'var(--brand)' }}>Edit lines</Link>
        </div>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-2)' }}>
            {['Item', 'Qty', 'Shipped', 'Balance', `Sell (${order.currency})`, 'Cost (₹)', 'Margin'].map((h, i) => (
              <th key={h} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`} style={{ color: 'var(--text-muted)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {lines.map(l => {
              const lineMargin = l.qty * (l.sell_rate * (Number(order.booked_rate) || 1) - l.cost_rate)
              const shipped = lineShipped(l.shipped_qty, l.sizes)
              const balance = Math.max(0, l.qty - Math.min(shipped, l.qty))
              return (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                    <div className="font-semibold">{l.item}</div>
                    {l.description && <div className="text-[12px] mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{l.description}</div>}
                    {l.sizes.length > 0 && <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{formatSizes(l.sizes)}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{l.qty.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right">
                    <input defaultValue={l.shipped_qty || ''} disabled={locked} inputMode="decimal" placeholder="0"
                      onBlur={e => saveShipped(l, num(e.target.value))}
                      className="w-20 px-2 py-1 rounded-lg border text-sm text-right" style={iStyle} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: balance > 0 ? 'var(--text-muted)' : 'var(--income)' }}>
                    {balance > 0 ? balance.toLocaleString('en-IN') : 'all gone'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{l.sell_rate.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{l.cost_rate.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: lineMargin < 0 ? 'var(--expense)' : 'var(--text)' }}>{sInr(lineMargin)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── The P/L ─────────────────────────────────────────────────────── */}
      <div id="order-pl" className="rounded-2xl border overflow-hidden scroll-mt-4" style={card}>
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Profit and loss</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Planned is what you costed at. Actual is what the real bills and the real rate came to.
            </p>
          </div>
          {!margin.actualIsComplete && (
            <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              Actual still has estimates in it
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }} />
              <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Planned</th>
              <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Actual</th>
            </tr>
          </thead>
          <tbody>
            {isExport && (
              <>
                <Row label={`Customer value (${order.currency})`} a={money(margin.planned.customerValueFx, order.currency)} b={money(margin.actual.customerValueFx, order.currency)} muted />
                <Row label="Exchange rate" a={margin.planned.rate.toFixed(2)} b={margin.actual.rate.toFixed(2)} muted />
              </>
            )}
            <Row label="Customer value" a={inr(margin.planned.customerValueInr)} b={inr(margin.actual.customerValueInr)} />
            <Row label="Supplier cost" a={sInr(-margin.planned.supplierCost)} b={sInr(-margin.actual.supplierCost)} negative />
            <Row label="Gross margin" a={sInr(margin.planned.gross)} b={sInr(margin.actual.gross)} strong />
            {order.drawback_basis && (
              <Row
                label={`Duty drawback${order.drawback_basis === 'percent' ? ` (${order.drawback_value}% of FOB)` : ''}`}
                a={inr(margin.planned.drawback)} b={inr(margin.actual.drawback)} />
            )}
            {margin.planned.costs.map((c, i) => (
              <Row key={i} label={c.name || 'Untitled cost'}
                a={sInr(c.amount)}
                b={sInr(margin.actual.costs[i]?.amount ?? 0)}
                bEstimated={margin.actual.costs[i]?.estimated}
                negative={c.amount < 0} />
            ))}
            <Row label="Net profit" a={sInr(margin.planned.net)} b={sInr(margin.actual.net)} strong big />
            <Row label="Margin on sales" a={`${margin.planned.marginPct.toFixed(2)}%`} b={`${margin.actual.marginPct.toFixed(2)}%`} muted />
            {isExport && (
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-5 py-2.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>What the rate did</td>
                <td />
                <td className="px-5 py-2.5 text-right tabular-nums font-bold" style={{ color: margin.fxEffect < 0 ? 'var(--expense)' : 'var(--income)' }}>
                  {margin.fxEffect === 0 ? '—' : sInr(margin.fxEffect)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── What really happened ────────────────────────────────────────── */}
      {(isExport || order.drawback_basis) && !locked && (
        <div className="rounded-2xl border p-5" style={card}>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>What really happened</h2>
          <p className="text-[12px] mt-0.5 mb-3" style={{ color: 'var(--text-muted)' }}>Fill these in as they land. Until then the sheet stands in the figures you costed at.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isExport && (
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Rate the bank actually gave <span style={{ color: 'var(--text-faint)' }}>(₹ per 1 {order.currency})</span>
                <input value={realisedRate} inputMode="decimal" placeholder={String(order.booked_rate)}
                  onChange={e => setRealisedRate(e.target.value)}
                  onBlur={() => patch({ realised_rate: realisedRate === '' ? null : num(realisedRate) })}
                  className={iCls} style={iStyle} />
              </label>
            )}
            {order.drawback_basis && (
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Drawback actually received (₹)
                <input value={drawbackActual} inputMode="decimal" placeholder={String(Math.round(margin.planned.drawback))}
                  onChange={e => setDrawbackActual(e.target.value)}
                  onBlur={() => patch({ drawback_actual: drawbackActual === '' ? null : num(drawbackActual) })}
                  className={iCls} style={iStyle} />
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── Costs ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5 space-y-3" style={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Costs and adjustments</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Freight, clearing, inspection, bank charges, commission, a discount given. Flat rupees, or a percentage of one of three things.
            </p>
          </div>
          {!locked && <button onClick={addCost} disabled={busy} className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add</button>}
        </div>

        {costs.length === 0 ? (
          <p className="text-[13px] py-3" style={{ color: 'var(--text-faint)' }}>Nothing yet. Gross margin is the whole story until you add some.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:grid gap-2 text-[10px] font-bold uppercase tracking-wide px-1" style={{ gridTemplateColumns: '1fr 70px 150px 110px 110px 32px', color: 'var(--text-muted)' }}>
              <span>Name</span><span>+ / −</span><span>Of what</span><span className="text-right">Planned</span><span className="text-right">Actual</span><span />
            </div>
            {costs.map(c => (
              <div key={c.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 70px 150px 110px 110px 32px' }}>
                <input defaultValue={c.name} disabled={locked} placeholder="Freight & clearing"
                  onBlur={e => saveCost(c, { name: e.target.value })}
                  className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                <select value={c.sign} disabled={locked} onChange={e => saveCost(c, { sign: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle}>
                  <option value={-1}>−</option><option value={1}>+</option>
                </select>
                <select value={c.basis} disabled={locked} onChange={e => saveCost(c, { basis: e.target.value as CostRow['basis'] })} className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle}>
                  <option value="flat">Flat ₹</option>
                  <option value="pct_customer">% of customer value</option>
                  <option value="pct_supplier">% of supplier cost</option>
                  <option value="pct_gross">% of gross margin</option>
                </select>
                <input defaultValue={c.planned || ''} disabled={locked} inputMode="decimal"
                  onBlur={e => saveCost(c, { planned: num(e.target.value) })}
                  className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                <input defaultValue={c.actual ?? ''} disabled={locked} inputMode="decimal" placeholder="not yet"
                  onBlur={e => saveCost(c, { actual: e.target.value.trim() === '' ? null : num(e.target.value) })}
                  className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                {!locked && <button onClick={() => removeCost(c)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Files ───────────────────────────────────────────────────────── */}
      <div id="order-files" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-4">
        <OrderFilesPanel
          orderId={order.id} side="customer" locked={locked} files={customerFiles}
          title="From the customer"
          blurb="Their PO, the tech pack, anything they sent. Kept with the job instead of in your inbox."
        />
        <OrderFilesPanel
          orderId={order.id} side="supplier" locked={locked} files={supplierFiles}
          title="For the supplier"
          blurb="Everything the supplier needs. These go in the pack you send them."
        >
          <SupplierPackButton
            orderNumber={order.number}
            poDocId={p.po?.id ?? null}
            poNumber={p.po?.number ?? null}
            supplierName={p.po?.supplierName ?? null}
            files={supplierFiles.map(f => ({ name: f.name, path: f.path }))}
            summary={p.summary}
          />
        </OrderFilesPanel>
      </div>

      {/* ── Paperwork ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Attached
          title="Sell side"
          blurb="Sales order, proforma, challans and the customer invoices."
          locked={locked}
          busy={busy}
          orderId={order.id}
          rows={[
            ...p.docs.filter(d => ['quotation', 'proforma_gst', 'sales_order', 'delivery_challan', 'credit_note'].includes(d.doc_type))
              .map(d => ({ id: d.id, table: 'documents', label: DOC_LABEL[d.doc_type] ?? d.doc_type, number: d.number, date: d.date, amount: inr0(d.total) })),
            ...p.custInvoices.map(i => ({ id: i.id, table: 'recoverable_invoices', label: 'Customer invoice', number: i.invoice_number, date: i.invoice_date, amount: money(i.total, i.currency || 'INR') })),
          ]}
          free={[
            ...p.freeSellDocs.map(d => ({ id: d.id, table: 'documents', label: `${DOC_LABEL[d.doc_type] ?? d.doc_type} ${d.number}`, date: d.date })),
            ...p.freeCustInvoices.map(i => ({ id: i.id, table: 'recoverable_invoices', label: `Customer invoice ${i.invoice_number}`, date: i.invoice_date })),
          ]}
          onLink={link}
        />
        <Attached
          title="Buy side"
          blurb="Purchase orders and the supplier bills."
          locked={locked}
          busy={busy}
          orderId={order.id}
          rows={[
            ...p.docs.filter(d => ['purchase_order', 'debit_note'].includes(d.doc_type))
              .map(d => ({ id: d.id, table: 'documents', label: DOC_LABEL[d.doc_type] ?? d.doc_type, number: d.number, date: d.date, amount: inr0(d.total) })),
            ...p.bills.map(b => ({ id: b.id, table: 'supplier_invoices', label: b.is_paid ? 'Supplier bill · paid' : 'Supplier bill', number: b.invoice_number ?? '—', date: b.invoice_date, amount: money(b.amount, b.currency || 'INR') })),
          ]}
          free={[
            ...p.freeBuyDocs.map(d => ({ id: d.id, table: 'documents', label: `${DOC_LABEL[d.doc_type] ?? d.doc_type} ${d.number}`, date: d.date })),
            ...p.freeBills.map(b => ({ id: b.id, table: 'supplier_invoices', label: `Supplier bill ${b.invoice_number ?? ''}`.trim(), date: b.invoice_date })),
          ]}
          onLink={link}
        />
      </div>

      {order.notes && (
        <div className="rounded-2xl border p-5" style={card}>
          <h2 className="text-[13px] font-extrabold mb-1" style={{ color: 'var(--text)' }}>Notes</h2>
          <p className="text-[13px] whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{order.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Row({ label, a, b, strong, big, muted, negative, bEstimated }: {
  label: string; a: string; b: string
  strong?: boolean; big?: boolean; muted?: boolean; negative?: boolean; bEstimated?: boolean
}) {
  const color = muted ? 'var(--text-muted)' : negative ? 'var(--expense)' : 'var(--text)'
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td className={`px-5 py-2.5 ${strong ? 'font-bold' : ''} ${big ? 'text-[15px]' : 'text-[13px]'}`} style={{ color: strong ? 'var(--text)' : 'var(--text-muted)' }}>{label}</td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${strong ? 'font-extrabold' : ''} ${big ? 'text-[15px]' : ''}`} style={{ color }}>{a}</td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${strong ? 'font-extrabold' : ''} ${big ? 'text-[15px]' : ''}`} style={{ color }}>
        {bEstimated && <span title="Still the planned figure — the real one has not arrived" style={{ color: 'var(--text-faint)' }}>~ </span>}{b}
      </td>
    </tr>
  )
}

interface AttachedRow { id: string; table: string; label: string; number: string; date: string; amount: string }
interface FreeRow { id: string; table: string; label: string; date: string }

function Attached({ title, blurb, rows, free, locked, busy, orderId, onLink }: {
  title: string; blurb: string; rows: AttachedRow[]; free: FreeRow[]
  locked: boolean; busy: boolean; orderId: string
  onLink: (table: string, id: string, orderId: string | null) => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="rounded-2xl border p-5 space-y-3" style={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{blurb}</p>
        </div>
        {!locked && (
          <button onClick={() => setPicking(v => !v)} className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
            <Link2 className="w-3.5 h-3.5" /> Attach
          </button>
        )}
      </div>

      {picking && (
        <div className="rounded-xl border max-h-56 overflow-y-auto" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {free.length === 0 ? (
            <p className="text-[12px] p-3" style={{ color: 'var(--text-faint)' }}>Nothing unattached to pick from.</p>
          ) : free.map(f => (
            <button key={`${f.table}:${f.id}`} disabled={busy}
              onClick={() => { onLink(f.table, f.id, orderId); setPicking(false) }}
              className="w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 hover:bg-[var(--surface)]"
              style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
              <span className="truncate">{f.label}</span>
              <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>{f.date}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: 'var(--text-faint)' }}>Nothing attached yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={`${r.table}:${r.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.label} {r.number}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.date}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{r.amount}</span>
                {!locked && (
                  <button onClick={async () => { if (await confirmDialog('Take this off the order?')) onLink(r.table, r.id, null) }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Detach">
                    <Unlink className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
