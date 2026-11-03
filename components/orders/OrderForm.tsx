'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { nextOrderNumber } from '@/lib/orders/number'
import { plannedFromLines } from '@/lib/orders/margin'
import { parseSizes, sizeTotal, formatSizes, sizeWarning, type SizeRow } from '@/lib/orders/sizes'
import { CURRENCIES } from '@/lib/currencies'

interface Opt { id: string; name: string }

export interface OrderInitialSize { sizeId?: string; label: string; qty: string }
export interface OrderInitialLine {
  lineId?: string
  item: string; description: string; hsn: string
  qty: string; sellRate: string; costRate: string
  sizes: OrderInitialSize[]
}
export interface OrderInitial {
  companyId: string; customerId: string; number: string
  customerPoNo: string; customerPoDate: string; orderDate: string
  currency: string; bookedRate: string
  cutoffDate: string; etd: string
  notes: string
  lines: OrderInitialLine[]
}

interface Props {
  companies: Opt[]
  customers: Opt[]
  existingNumbers: string[]
  orderId?: string | null
  initial?: OrderInitial
}

interface SizeItem { key: number; sizeId?: string; label: string; qty: string }
interface Line {
  key: number; lineId?: string
  item: string; description: string; hsn: string
  qty: string; sellRate: string; costRate: string
  sizes: SizeItem[]
  open: boolean
}

let seq = 0
const num = (v: string) => parseFloat(v) || 0
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)

/** Sizes win whenever there are any — see lib/orders/sizes.ts. */
const sizeRows = (l: Line): SizeRow[] => l.sizes.filter(s => s.label.trim()).map(s => ({ label: s.label.trim(), qty: num(s.qty) }))
const effectiveQty = (l: Line): number => (sizeRows(l).length ? sizeTotal(sizeRows(l)) : num(l.qty))

const blankLine = (): Line => ({ key: ++seq, item: '', description: '', hsn: '', qty: '', sellRate: '', costRate: '', sizes: [], open: false })

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
  const [cutoffDate, setCutoffDate] = useState(initial?.cutoffDate ?? '')
  const [etd, setEtd] = useState(initial?.etd ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines?.length
      ? initial.lines.map(l => ({
          key: ++seq, lineId: l.lineId,
          item: l.item, description: l.description, hsn: l.hsn,
          qty: l.qty, sellRate: l.sellRate, costRate: l.costRate,
          sizes: l.sizes.map(s => ({ key: ++seq, sizeId: s.sizeId, label: s.label, qty: s.qty })),
          open: l.sizes.length > 0 || !!l.description,
        }))
      : [blankLine()])
  const [saving, setSaving] = useState(false)

  const isExport = currency !== 'INR'
  const setLine = (key: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  const setSize = (lk: number, sk: number, patch: Partial<SizeItem>) =>
    setLines(prev => prev.map(l => l.key === lk ? { ...l, sizes: l.sizes.map(s => s.key === sk ? { ...s, ...patch } : s) } : l))

  const preview = useMemo(() => {
    const p = plannedFromLines(lines.map(l => ({ qty: effectiveQty(l), sellRate: num(l.sellRate), costRate: num(l.costRate) })))
    const rate = num(bookedRate) || 1
    const valueInr = p.customerValue * rate
    const gross = valueInr - p.supplierCost
    return { ...p, valueInr, gross, pct: valueInr ? (gross / valueInr) * 100 : 0 }
  }, [lines, bookedRate])

  async function save() {
    const customer = customers.find(c => c.id === customerId)
    if (!customer) { notify('Pick a customer', 'info'); return }
    const valid = lines.filter(l => l.item.trim() && effectiveQty(l) > 0)
    if (valid.length === 0) { notify('Add at least one line with a quantity', 'info'); return }

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
        cutoff_date: cutoffDate || null,
        etd: etd || null,
        notes: notes.trim() || null,
      }

      const body = (l: Line, i: number) => ({
        line_number: i + 1,
        item: l.item.trim(),
        description: l.description.trim() || null,
        hsn_sac: l.hsn.trim() || null,
        // The stored quantity is always the effective one, so anything reading
        // order_lines straight out of the database gets the right number
        // without having to know the size rule.
        qty: effectiveQty(l),
        sell_rate: num(l.sellRate),
        cost_rate: num(l.costRate),
      })

      let savedId = orderId
      if (isEdit && orderId) {
        const { error } = await sb.from('orders').update(fields).eq('id', orderId).eq('user_id', user.id)
        if (error) { notify(error.message, 'error'); return }
      } else {
        const { data, error } = await sb.from('orders')
          .insert({ user_id: user.id, number: numberStr, stage: 'confirmed', ...fields })
          .select('id').single()
        if (error || !data) { notify(error?.message ?? 'Could not save', 'error'); return }
        savedId = data.id
      }
      if (!savedId) return

      // Lines are matched BY ID, not deleted and re-inserted like the other
      // document forms do. An order line carries how much of it has shipped,
      // and wiping that to correct a rate would lose a part shipment.
      const keptLines: string[] = []
      for (let i = 0; i < valid.length; i++) {
        const l = valid[i]
        let lineId = l.lineId
        if (lineId) {
          await sb.from('order_lines').update(body(l, i)).eq('id', lineId).eq('user_id', user.id)
        } else {
          const { data } = await sb.from('order_lines')
            .insert({ order_id: savedId, user_id: user.id, ...body(l, i) })
            .select('id').single()
          lineId = data?.id as string | undefined
        }
        if (!lineId) continue
        keptLines.push(lineId)

        // Sizes, same treatment and for the same reason.
        const rows = l.sizes.filter(s => s.label.trim())
        const keptSizes: string[] = []
        for (let j = 0; j < rows.length; j++) {
          const s = rows[j]
          const sBody = { order_id: savedId, line_id: lineId, sort: j + 1, label: s.label.trim(), qty: num(s.qty) }
          if (s.sizeId) {
            await sb.from('order_line_sizes').update(sBody).eq('id', s.sizeId).eq('user_id', user.id)
            keptSizes.push(s.sizeId)
          } else {
            const { data } = await sb.from('order_line_sizes')
              .insert({ user_id: user.id, ...sBody }).select('id').single()
            if (data) keptSizes.push(data.id as string)
          }
        }
        const goneSizes = (initial?.lines.find(x => x.lineId === lineId)?.sizes ?? [])
          .map(s => s.sizeId).filter((x): x is string => !!x && !keptSizes.includes(x))
        if (goneSizes.length) await sb.from('order_line_sizes').delete().in('id', goneSizes).eq('user_id', user.id)
      }
      const goneLines = (initial?.lines ?? []).map(l => l.lineId)
        .filter((x): x is string => !!x && !keptLines.includes(x))
      if (goneLines.length) await sb.from('order_lines').delete().in('id', goneLines).eq('user_id', user.id)

      notify(`Order ${numberStr} ${isEdit ? 'updated' : 'created'} ✓`, 'success')
      router.push(`/orders/${savedId}`)
      router.refresh()
    } finally { setSaving(false) }
  }

  const iCls = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lab = 'text-[11px] font-semibold'
  const labStyle = { color: 'var(--text-muted)' }
  const GRID = '1fr 80px 80px 90px 100px 90px 32px'

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
          <label className={lab} style={labStyle}>Customer
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
          <label className={lab} style={labStyle}>Cut-off date <span style={{ color: 'var(--text-faint)' }}>(optional)</span>
            <input type="date" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} className={iCls} style={iStyle} />
            <span className="block mt-1 text-[10px] font-normal" style={{ color: 'var(--text-faint)' }}>Last date this order can be accepted or changed</span>
          </label>
          <label className={lab} style={labStyle}>ETD <span style={{ color: 'var(--text-faint)' }}>(optional)</span>
            <input type="date" value={etd} onChange={e => setEtd(e.target.value)} className={iCls} style={iStyle} />
            <span className="block mt-1 text-[10px] font-normal" style={{ color: 'var(--text-faint)' }}>Estimated date of despatch. Copied onto the purchase order.</span>
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
          // Duty drawback is NOT asked for here. It is set when the goods
          // ship, on the order page — before then there is nothing to claim
          // it against, and a rate typed in now is a guess that quietly
          // becomes a number on the P/L.
          <p className="text-[12px] pt-1" style={{ color: 'var(--text-faint)' }}>
            Duty drawback is set on the order page once the goods have shipped.
          </p>
        )}
      </div>

      {/* ── Lines ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>What was ordered</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Both rates on one line — sell in {currency}, cost in rupees. Open a line to write the spec and split it size by size.
          </p>
        </div>

        <div className="hidden md:grid gap-2 text-[10px] font-bold uppercase tracking-wide px-1" style={{ gridTemplateColumns: GRID, color: 'var(--text-muted)' }}>
          <span>Style</span><span>HSN</span><span>Qty</span><span>Sell ({currency})</span><span>Cost (₹/unit)</span><span className="text-right">Margin</span><span />
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => {
            const rows = sizeRows(l)
            const qty = effectiveQty(l)
            const fromSizes = rows.length > 0
            const warn = sizeWarning(num(l.qty), rows)
            const lineMargin = qty * (num(l.sellRate) * (num(bookedRate) || 1) - num(l.costRate))
            const del = () => setLines(prev => prev.length > 1 ? prev.filter(x => x.key !== l.key) : prev)

            return (
              <div key={l.key} className="rounded-xl border" style={{ borderColor: 'var(--border)', background: l.open ? 'var(--surface-2)' : 'transparent' }}>
                {/* Phone */}
                <div className="md:hidden p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Line {idx + 1}</span>
                    <button onClick={del} className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Remove line"><Trash2 className="w-4 h-4 text-[var(--expense)]" /></button>
                  </div>
                  <input value={l.item} onChange={e => setLine(l.key, { item: e.target.value })} placeholder="Style / description" className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ ...iStyle, background: 'var(--surface)' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>HSN
                      <input value={l.hsn} onChange={e => setLine(l.key, { hsn: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Qty {fromSizes && <span style={{ color: 'var(--brand)' }}>from sizes</span>}
                      <input value={fromSizes ? String(qty) : l.qty} readOnly={fromSizes} onChange={e => setLine(l.key, { qty: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)', opacity: fromSizes ? 0.7 : 1 }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Sell ({currency})
                      <input value={l.sellRate} onChange={e => setLine(l.key, { sellRate: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Cost (₹)
                      <input value={l.costRate} onChange={e => setLine(l.key, { costRate: e.target.value })} inputMode="decimal" className="w-full px-3 py-2.5 rounded-lg border text-sm mt-0.5" style={{ ...iStyle, background: 'var(--surface)' }} /></label>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={() => setLine(l.key, { open: !l.open })} className="text-[12px] font-bold inline-flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                      {l.open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Spec &amp; sizes
                    </button>
                    <span className="text-[15px] font-extrabold tabular-nums" style={{ color: lineMargin < 0 ? 'var(--expense)' : 'var(--text)' }}>{inr(lineMargin)}</span>
                  </div>
                </div>

                {/* Desktop */}
                <div className="hidden md:grid gap-2 items-center p-2" style={{ gridTemplateColumns: GRID }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button onClick={() => setLine(l.key, { open: !l.open })} className="w-6 h-6 shrink-0 rounded flex items-center justify-center" style={{ color: 'var(--text-muted)' }} aria-label="Spec and sizes">
                      {l.open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <input value={l.item} onChange={e => setLine(l.key, { item: e.target.value })} placeholder="Style / description" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                  </div>
                  <input value={l.hsn} onChange={e => setLine(l.key, { hsn: e.target.value })} className="px-2 py-1.5 rounded-lg border text-sm" style={iStyle} />
                  <input value={fromSizes ? String(qty) : l.qty} readOnly={fromSizes} title={fromSizes ? 'Added up from the sizes below' : undefined}
                    onChange={e => setLine(l.key, { qty: e.target.value })} inputMode="decimal"
                    className="px-2 py-1.5 rounded-lg border text-sm text-right" style={{ ...iStyle, opacity: fromSizes ? 0.7 : 1, cursor: fromSizes ? 'not-allowed' : 'auto' }} />
                  <input value={l.sellRate} onChange={e => setLine(l.key, { sellRate: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                  <input value={l.costRate} onChange={e => setLine(l.key, { costRate: e.target.value })} inputMode="decimal" className="px-2 py-1.5 rounded-lg border text-sm text-right" style={iStyle} />
                  <span className="text-right text-[13px] tabular-nums" style={{ color: lineMargin < 0 ? 'var(--expense)' : 'var(--text)' }}>{inr(lineMargin)}</span>
                  <button onClick={del} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                </div>

                {/* ── Spec and sizes ──────────────────────────────────────── */}
                {l.open && (
                  <div className="px-3 pb-3 md:px-10 space-y-3">
                    <label className="block text-[11px] font-semibold" style={labStyle}>Spec and notes for this style
                      <textarea value={l.description} onChange={e => setLine(l.key, { description: e.target.value })} rows={3}
                        placeholder="180 GSM single jersey, bio-washed and compacted. YKK zip. Labels as per tech pack. Packing: 1 pc per polybag, 20 per carton."
                        className="w-full px-3 py-2 rounded-lg border text-sm mt-1 resize-y" style={{ ...iStyle, background: 'var(--surface)' }} />
                    </label>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold" style={labStyle}>
                          Size breakdown {fromSizes && <b style={{ color: 'var(--text)' }}>· {qty.toLocaleString('en-IN')} pcs</b>}
                        </span>
                        <button onClick={() => setLine(l.key, { sizes: [...l.sizes, { key: ++seq, label: '', qty: '' }] })} className="text-[12px] font-bold inline-flex items-center gap-1" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add size</button>
                      </div>

                      {/* Typing "S 200, M 400, L 400" beats four rounds of
                          clicking, and it is how a breakdown arrives on
                          WhatsApp in the first place. */}
                      <input
                        placeholder="Paste a breakdown: S 200, M 400, L 400, XL 200"
                        className="w-full px-3 py-2 rounded-lg border text-sm mt-1" style={{ ...iStyle, background: 'var(--surface)' }}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          const parsed = parseSizes((e.target as HTMLInputElement).value)
                          if (!parsed.length) return
                          setLine(l.key, { sizes: [...l.sizes, ...parsed.map(s => ({ key: ++seq, label: s.label, qty: String(s.qty) }))] })
                          ;(e.target as HTMLInputElement).value = ''
                        }}
                        onBlur={e => {
                          const parsed = parseSizes(e.target.value)
                          if (!parsed.length) return
                          setLine(l.key, { sizes: [...l.sizes, ...parsed.map(s => ({ key: ++seq, label: s.label, qty: String(s.qty) }))] })
                          e.target.value = ''
                        }}
                      />

                      {l.sizes.length > 0 && (
                        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                          {l.sizes.map(s => (
                            <div key={s.key} className="flex items-center gap-1.5">
                              <input value={s.label} onChange={e => setSize(l.key, s.key, { label: e.target.value })} placeholder="Size" className="w-20 px-2 py-1.5 rounded-lg border text-sm" style={{ ...iStyle, background: 'var(--surface)' }} />
                              <input value={s.qty} onChange={e => setSize(l.key, s.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-sm text-right" style={{ ...iStyle, background: 'var(--surface)' }} />
                              <button onClick={() => setLine(l.key, { sizes: l.sizes.filter(x => x.key !== s.key) })} className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Remove size"><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      {warn && <p className="text-[12px] mt-1.5" style={{ color: '#92400E' }}>{warn}</p>}
                      {fromSizes && <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-faint)' }}>Goes to the supplier as: {formatSizes(rows)}</p>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={() => setLines(prev => [...prev, blankLine()])} className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}><Plus className="w-3.5 h-3.5" /> Add line</button>

        <div className="rounded-xl p-3 mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 text-[13px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <span>Customer value <b className="tabular-nums" style={{ color: 'var(--text)' }}>{currency === 'INR' ? inr(preview.customerValue) : `${currency} ${preview.customerValue.toLocaleString('en-IN')}`}</b></span>
          {isExport && <span>In rupees <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(preview.valueInr)}</b></span>}
          <span>Supplier cost <b className="tabular-nums" style={{ color: 'var(--text)' }}>{inr(preview.supplierCost)}</b></span>
          <span className="text-[15px]">Gross margin <b className="tabular-nums" style={{ color: preview.gross < 0 ? 'var(--expense)' : 'var(--income)' }}>{inr(preview.gross)} ({preview.pct.toFixed(1)}%)</b></span>
        </div>
      </div>

      <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <label className="text-[11px] font-semibold" style={labStyle}>Notes on this order
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6}
            placeholder="Anything about this job — payment terms agreed on the phone, inspection arrangements, who to chase at the supplier, what went wrong last time."
            className="w-full px-3 py-2 rounded-lg border text-sm mt-1 resize-y" style={iStyle} />
        </label>
      </div>
    </div>
  )
}
