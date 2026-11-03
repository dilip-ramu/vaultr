'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { nextOrderNumber } from '@/lib/orders/number'
import { plannedFromLines } from '@/lib/orders/margin'
import { CURRENCIES } from '@/lib/currencies'

interface Opt { id: string; name: string }

export interface OrderInitial {
  companyId: string
  customerId: string
  number: string
  customerPoNo: string
  customerPoDate: string
  orderDate: string
  currency: string
  bookedRate: string
  drawbackBasis: '' | 'percent' | 'amount'
  drawbackValue: string
  notes: string
  lines: { lineId?: string; item: string; hsn: string; qty: string; sellRate: string; costRate: string }[]
}

interface Props {
  companies: Opt[]
  customers: Opt[]
  /** Order numbers already used, so a new one does not collide. */
  existingNumbers: string[]
  orderId?: string | null
  initial?: OrderInitial
}

interface Line { id: number; lineId?: string; item: string; hsn: string; qty: string; sellRate: string; costRate: string }
let seq = 0
const num = (v: string) => parseFloat(v) || 0
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)

export default function OrderForm({ companies, customers, existingNumbers, orderId = null, initial }: Props) {
  const router = useRouter()
  const isEdit = !!orderId

  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '')
  const [numberStr] = useState(() => initial?.number ?? nextOrderNumber(existingNumbers))
  const [customerPoNo, setCustomerPoNo] = useState(initial?.customerPoNo ?? '')
  const [customerPoDate, setCustomerPoDate] = useState(initial?.customerPoDate ?? '')
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? new Date().toISOString().slice(0, 10))
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [bookedRate, setBookedRate] = useState(initial?.bookedRate ?? '1')
  const [drawbackBasis, setDrawbackBasis] = useState<'' | 'percent' | 'amount'>(initial?.drawbackBasis ?? '')
  const [drawbackValue, setDrawbackValue] = useState(initial?.drawbackValue ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines?.length
      ? initial.lines.map(l => ({ id: ++seq, ...l }))
      : [{ id: ++seq, item: '', hsn: '', qty: '', sellRate: '', costRate: '' }])
  const [saving, setSaving] = useState(false)

  const isExport = currency !== 'INR'
  const setLine = (id: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))

  // Live margin as you type the rates — the number you are actually
  // negotiating against, shown while you negotiate rather than after.
  const preview = useMemo(() => {
    const p = plannedFromLines(lines.map(l => ({ qty: num(l.qty), sellRate: num(l.sellRate), costRate: num(l.costRate) })))
    const rate = num(bookedRate) || 1
    const valueInr = p.customerValue * rate
    const gross = valueInr - p.supplierCost
    return { ...p, valueInr, gross, pct: valueInr ? (gross / valueInr) * 100 : 0 }
  }, [lines, bookedRate])

  async function save() {
    const customer = customers.find(c => c.id === customerId)
    if (!customer) { notify('Pick a customer', 'info'); return }
    const valid = lines.filter(l => l.item.trim() && num(l.qty) > 0)
    if (valid.length === 0) { notify('Add at least one line', 'info'); return }

    setSaving(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      const fields = {
        company_id: companyId || null,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_po_no: customerPoNo.trim() || null,
        customer_po_date: customerPoDate || null,
        order_date: orderDate,
        currency,
        booked_rate: isExport ? (num(bookedRate) || 1) : 1,
        drawback_basis: drawbackBasis || null,
        drawback_value: drawbackBasis ? num(drawbackValue) : 0,
        notes: notes.trim() || null,
      }

      const body = (l: Line, i: number) => ({
        line_number: i + 1,
        item: l.item.trim(), hsn_sac: l.hsn.trim() || null,
        qty: num(l.qty), sell_rate: num(l.sellRate), cost_rate: num(l.costRate),
      })

      let savedId = orderId
      if (isEdit && orderId) {
        const { error } = await sb.from('orders').update(fields).eq('id', orderId).eq('user_id', user.id)
        if (error) { notify(error.message, 'error'); return }

        // Lines are matched BY ID, not deleted and re-inserted. The other
        // document forms here replace lines wholesale, which is fine for
        // them — but an order line also carries how much of it has already
        // shipped, and wiping that to correct a rate would quietly lose a
        // part shipment.
        const kept: string[] = []
        for (let i = 0; i < valid.length; i++) {
          const l = valid[i]
          if (l.lineId) {
            await sb.from('order_lines').update(body(l, i)).eq('id', l.lineId).eq('user_id', user.id)
            kept.push(l.lineId)
          } else {
            const { data } = await sb.from('order_lines')
              .insert({ order_id: orderId, user_id: user.id, ...body(l, i) })
              .select('id').single()
            if (data) kept.push(data.id as string)
          }
        }
        const removed = (initial?.lines ?? [])
          .map(l => l.lineId)
          .filter((id): id is string => !!id && !kept.includes(id))
        if (removed.length) await sb.from('order_lines').delete().in('id', removed).eq('user_id', user.id)
      } else {
        const { data, error } = await sb.from('orders')
          .insert({ user_id: user.id, number: numberStr, stage: 'confirmed', ...fields })
          .select('id').single()
        if (error || !data) { notify(error?.message ?? 'Could not save', 'error'); return }
        savedId = data.id
        await sb.from('order_lines').insert(valid.map((l, i) => ({ order_id: savedId, user_id: user.id, ...body(l, i) })))
      }

      notify(`Order ${numberStr} ${isEdit ? 'updated' : 'created'} ✓`, 'success')
      router.push(`/orders/${savedId}`)
      router.refresh()
    } finally { setSaving(false) }
  }

  const iCls = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lab = 'text-[11px] font-semibold'
  const labStyle = { color: 'var(--text-muted)' }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={isEdit ? `/orders/${orderId}` : '/orders'} className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><ChevronLeft className="w-4 h-4" /></Link>
          <h1 className="text-lg md:text-2xl font-extrabold tracking-tight truncate" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit order' : 'New order'}</h1>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create order')}
        </button>
      </div>

      <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={lab} style={labStyle}>Company
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={iCls} style={iStyle}>
              <option value="">— pick —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={lab} style={labStyle}>Our order number <span style={{ color: 'var(--text-faint)' }}>({isEdit ? 'locked' : 'auto'})</span>
            <input value={numberStr} readOnly className={iCls} style={{ ...iStyle, opacity: 0.7, cursor: 'not-allowed' }} />
          </label>
          <label className={lab} style={labStyle}>Customer <span style={{ color: 'var(--text-faint)' }}>(fixed once set)</span>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={iCls} style={iStyle}>
              <option value="">— pick —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={lab} style={labStyle}>Order date
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className={iCls} style={iStyle} />
          </label>
          <label className={lab} style={labStyle}>Their PO number
            <input value={customerPoNo} onChange={e => setCustomerPoNo(e.target.value)} placeholder="As the customer wrote it" className={iCls} style={iStyle} />
          </label>
          <label className={lab} style={labStyle}>Their PO date
            <input type="date" value={customerPoDate} onChange={e => setCustomerPoDate(e.target.value)} className={iCls} style={iStyle} />
          </label>
          <label className={lab} style={labStyle}>Currency
            <select value={currency} onChange={e => { setCurrency(e.target.value); if (e.target.value === 'INR') setBookedRate('1') }} className={iCls} style={iStyle}>
              <option value="INR">INR — Indian Rupee</option>
              {CURRENCIES.filter(c => c.code !== 'INR').map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          {isExport && (
            <label className={lab} style={labStyle}>Rate you costed at <span style={{ color: 'var(--text-faint)' }}>(₹ per 1 {currency})</span>
              <input value={bookedRate} onChange={e => setBookedRate(e.target.value)} inputMode="decimal" placeholder="88.50" className={iCls} style={iStyle} />
            </label>
          )}
        </div>

        {isExport && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className={lab} style={labStyle}>Duty drawback
              <select value={drawbackBasis} onChange={e => setDrawbackBasis(e.target.value as '' | 'percent' | 'amount')} className={iCls} style={iStyle}>
                <option value="">None on this order</option>
                <option value="percent">Percentage of FOB</option>
                <option value="amount">Fixed amount</option>
              </select>
            </label>
            {drawbackBasis && (
              <label className={lab} style={labStyle}>{drawbackBasis === 'percent' ? 'Drawback rate (%)' : 'Drawback amount (₹)'}
                <input value={drawbackValue} onChange={e => setDrawbackValue(e.target.value)} inputMode="decimal" placeholder={drawbackBasis === 'percent' ? '1.8' : '76464'} className={iCls} style={iStyle} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* ── Lines: what you sell and what it costs, side by side ──────────── */}
      <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>What was ordered</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Both rates on one line. The sell rate is in {currency}, the cost rate is what you agreed with the supplier, in rupees.
          </p>
        </div>

        <div className="hidden md:grid gap-2 text-[10px] font-bold uppercase tracking-wide px-1" style={{ gridTemplateColumns: '1fr 80px 70px 90px 100px 90px 32px', color: 'var(--text-muted)' }}>
          <span>Item</span><span>HSN</span><span>Qty</span><span>Sell ({currency})</span><span>Cost (₹/unit)</span><span className="text-right">Margin</span><span />
        </div>

        <div className="space-y-3 md:space-y-1.5">
          {lines.map((l, idx) => {
            const rate = num(bookedRate) || 1
            const lineMargin = num(l.qty) * (num(l.sellRate) * rate - num(l.costRate))
            const del = () => setLines(prev => prev.length > 1 ? prev.filter(x => x.id !== l.id) : prev)
            return (
              <div key={l.id}>
                <div className="md:hidden rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Line {idx + 1}</span>
                    <button onClick={del} className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Remove line"><Trash2 className="w-4 h-4 text-[var(--expense)]" /></button>
                  </div>
                  <input value={l.item} onChange={e => setLine(l.id, { item: e.target.value })} placeholder="Style / description" className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ ...iStyle, background: 'var(--surface)' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>HSN
                      <input value={l.hsn} onChange={e => setLine(l.id, { hsn: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Qty
                      <input value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Sell ({currency})
                      <input value={l.sellRate} onChange={e => setLine(l.id, { sellRate: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Cost (₹)
                      <input value={l.costRate} onChange={e => setLine(l.id, { costRate: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Margin</span>
                    <span className="text-[15px] font-extrabold tabular-nums" style={{ color: lineMargin < 0 ? 'var(--expense)' : 'var(--text)' }}>{inr(lineMargin)}</span>
                  </div>
                </div>

                <div className="hidden md:grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 80px 70px 90px 100px 90px 32px' }}>
                  <input value={l.item} onChange={e => setLine(l.id, { item: e.target.value })} placeholder="Style / description" className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                  <input value={l.hsn} onChange={e => setLine(l.id, { hsn: e.target.value })} className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                  <input value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                  <input value={l.sellRate} onChange={e => setLine(l.id, { sellRate: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                  <input value={l.costRate} onChange={e => setLine(l.id, { costRate: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                  <span className="text-right text-[13px] tabular-nums" style={{ color: lineMargin < 0 ? 'var(--expense)' : 'var(--text)' }}>{inr(lineMargin)}</span>
                  <button onClick={del} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={() => setLines(prev => [...prev, { id: ++seq, item: '', hsn: '', qty: '', sellRate: '', costRate: '' }])} className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add line</button>

        {/* The number you are negotiating against, while you negotiate. */}
        <div className="rounded-xl p-3 mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 text-[13px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <span>Customer value <b className="tabular-nums" style={{ color: 'var(--text)' }}>{currency === 'INR' ? inr(preview.customerValue) : `${currency} ${preview.customerValue.toLocaleString('en-IN')}`}</b></span>
          {isExport && <span>In rupees <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(preview.valueInr)}</b></span>}
          <span>Supplier cost <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(preview.supplierCost)}</b></span>
          <span className="text-[15px]">Gross margin <b className="tabular-nums" style={{ color: preview.gross < 0 ? 'var(--expense)' : 'var(--income)' }}>{inr(preview.gross)} ({preview.pct.toFixed(1)}%)</b></span>
        </div>
      </div>

      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes about this order" rows={2} className="w-full px-3 py-2 rounded-lg border text-sm resize-none" style={iStyle} />
    </div>
  )
}
