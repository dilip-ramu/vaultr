'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, RefreshCw } from 'lucide-react'
import type {
  CommissionOrder, CommissionStyle, CommissionType,
  OrderStatus, Customer, Account, PaymentTerms,
} from '@/lib/types'
import {
  PAYMENT_TERMS_LABELS, ORDER_STATUS_LABELS, PAYMENT_TERM_DAYS,
} from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString, accountGroupRank } from '@/lib/utils'
import { CURRENCIES } from '@/lib/currencies'
import { computeStyleAmounts } from '@/lib/commission'

interface Props {
  order: CommissionOrder | null
  customers: Customer[]
  accounts: Account[]
  onSaved: (order: CommissionOrder) => void
  onClose: () => void
}

interface StyleDraft {
  id?: string           // present when editing existing style
  style_ref: string
  quantity: string
  rate_per_piece: string
  commission_type: CommissionType
  commission_value: string   // %, per-piece amount, or fixed total
  order_status: OrderStatus
  etd: string
  notes: string
}

function blankStyle(): StyleDraft {
  return {
    style_ref: '', quantity: '', rate_per_piece: '',
    commission_type: 'percentage', commission_value: '10',
    order_status: 'current', etd: '', notes: '',
  }
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  backlog:   'bg-gray-100 text-gray-600',
  current:   'bg-blue-100 text-blue-700',
  shipped:   'bg-amber-100 text-amber-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const inputCls   = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
const inputStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

export default function CommissionForm({ order, customers, accounts, onSaved, onClose }: Props) {
  const isEdit = !!order

  // ── Order-level state ──────────────────────────────────────────
  const [customerId,   setCustomerId]   = useState(order?.customer_id ?? '')
  const [accountId,    setAccountId]    = useState(order?.account_id ?? '')
  const [orderNumber,  setOrderNumber]  = useState(order?.order_number ?? '')
  const [orderDate,    setOrderDate]    = useState(order?.order_date ?? getTodayString())
  const [paymentTerm,  setPaymentTerm]  = useState<PaymentTerms>(order?.payment_term ?? 'net_30')
  const [currency,     setCurrency]     = useState(order?.currency ?? 'INR')
  const [exchangeRate, setExchangeRate] = useState<number | null>(order?.exchange_rate ?? null)
  const [loadingRate,  setLoadingRate]  = useState(false)
  const [notes,        setNotes]        = useState(order?.notes ?? '')
  const [showCurrPicker, setShowCurrPicker] = useState(false)
  const [currSearch,   setCurrSearch]   = useState('')

  // ── Style lines ────────────────────────────────────────────────
  const [styles, setStyles] = useState<StyleDraft[]>(() => {
    if (order?.styles && order.styles.length > 0) {
      return order.styles.map(s => ({
        id:               s.id,
        style_ref:        s.style_ref ?? '',
        quantity:         s.quantity.toString(),
        rate_per_piece:   s.rate_per_piece.toString(),
        commission_type:  s.commission_type,
        commission_value: s.commission_type === 'percentage' ? (s.commission_percentage ?? 10).toString()
                        : s.commission_type === 'per_piece'  ? (s.commission_per_piece  ?? 0).toString()
                        : (s.commission_fixed ?? 0).toString(),
        order_status: s.order_status,
        etd:          s.etd ?? '',
        notes:        s.notes ?? '',
      }))
    }
    return [blankStyle()]
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Fetch market exchange rate ──────────────────────────────────
  const fetchRate = useCallback(async (curr: string) => {
    if (curr === 'INR') { setExchangeRate(null); return }
    setLoadingRate(true)
    try {
      const res  = await fetch('/api/exchange-rates')
      const json = await res.json()
      const r    = json.rates?.[curr]
      setExchangeRate(r ?? null)
    } catch {
      setExchangeRate(null)
    } finally {
      setLoadingRate(false)
    }
  }, [])

  useEffect(() => { fetchRate(currency) }, [currency, fetchRate])

  // ── Style helpers ──────────────────────────────────────────────
  const updateStyle = (i: number, patch: Partial<StyleDraft>) =>
    setStyles(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const removeStyle = (i: number) =>
    setStyles(prev => prev.filter((_, idx) => idx !== i))

  const addStyle = () => setStyles(prev => [...prev, blankStyle()])

  // ── Totals ─────────────────────────────────────────────────────
  const activeStyles = styles.filter(s => s.order_status !== 'cancelled')
  const totalCommInr = activeStyles.reduce((sum, s) => {
    const { inr } = computeStyleAmounts(s, exchangeRate, currency)
    return sum + inr
  }, 0)

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!customerId) { setError('Select a customer'); return }
    if (styles.length === 0) { setError('Add at least one style'); return }
    if (currency !== 'INR' && !exchangeRate) { setError('Could not fetch exchange rate — try again'); return }

    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const orderPayload = {
      customer_id:   customerId,
      account_id:    accountId || null,
      order_number:  orderNumber.trim() || null,
      order_date:    orderDate,
      payment_term:  paymentTerm,
      currency,
      exchange_rate: currency !== 'INR' ? exchangeRate : null,
      notes:         notes.trim() || null,
    }

    let orderId = order?.id
    if (isEdit) {
      const { error: e } = await supabase.from('commission_orders').update(orderPayload).eq('id', order!.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { data: newOrder, error: e } = await supabase
        .from('commission_orders')
        .insert({ ...orderPayload, user_id: user!.id })
        .select('id').single()
      if (e) { setError(e.message); setSaving(false); return }
      orderId = newOrder.id
    }

    // Upsert styles
    const termDays = PAYMENT_TERM_DAYS[paymentTerm]
    const stylePayloads = styles.map(s => {
      const qty   = parseFloat(s.quantity)       || 0
      const rate  = parseFloat(s.rate_per_piece) || 0
      const val   = parseFloat(s.commission_value) || 0
      const { total, comm, inr } = computeStyleAmounts(s, exchangeRate, currency)
      const isShipped = s.order_status === 'shipped'
      const today = getTodayString()

      return {
        ...(s.id ? { id: s.id } : {}),
        order_id:        orderId!,
        user_id:         user!.id,
        style_ref:       s.style_ref.trim() || null,
        quantity:        qty,
        rate_per_piece:  rate,
        total_value:     total,
        commission_type: s.commission_type,
        commission_percentage: s.commission_type === 'percentage' ? val : null,
        commission_per_piece:  s.commission_type === 'per_piece'  ? val : null,
        commission_fixed:      s.commission_type === 'fixed'      ? val : null,
        commission_amount: comm,
        commission_inr:    inr,
        order_status:      s.order_status,
        etd:               s.etd || null,
        shipped_date:      isShipped ? today : null,
        expected_payment_date: isShipped && termDays
          ? new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0]
          : null,
        notes: s.notes.trim() || null,
      }
    })

    // Delete removed styles (edit mode)
    if (isEdit && order!.styles) {
      const keptIds = new Set(styles.filter(s => s.id).map(s => s.id))
      const toDelete = order!.styles.filter(s => !keptIds.has(s.id)).map(s => s.id)
      if (toDelete.length > 0) {
        await supabase.from('commission_styles').delete().in('id', toDelete).eq('user_id', user!.id)
      }
    }

    const { error: se } = await supabase
      .from('commission_styles')
      .upsert(stylePayloads, { onConflict: 'id' })
    if (se) { setError(se.message); setSaving(false); return }

    // Re-fetch full order with styles
    const { data: full } = await supabase
      .from('commission_orders')
      .select('*, customer:customers(*), account:accounts(id,name), styles:commission_styles(*)')
      .eq('id', orderId!)
      .single()

    onSaved(full)
  }

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(currSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(currSearch.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full md:max-w-2xl rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Edit order' : 'New order'}
          </h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {/* ── Order header fields ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Customer *</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Order number</label>
              <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
                placeholder="e.g. PO-001" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Order date</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Payment term</label>
              <select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value as PaymentTerms)}
                className={inputCls} style={inputStyle}>
                {Object.entries(PAYMENT_TERMS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Deposit account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}
                className={inputCls} style={inputStyle}>
                <option value="">No account</option>
                {[...accounts].sort((a, b) =>
                  (accountGroupRank(a.type, a.custom_type_name) - accountGroupRank(b.type, b.custom_type_name))
                  || a.name.localeCompare(b.name)
                ).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Currency */}
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Currency</label>
              <div className="relative">
                <button type="button" onClick={() => setShowCurrPicker(v => !v)}
                  className={`${inputCls} text-left flex items-center justify-between`} style={inputStyle}>
                  <span className="font-medium">{currency}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {CURRENCIES.find(c => c.code === currency)?.name}
                    {currency !== 'INR' && exchangeRate && (
                      <span className="ml-2">
                        · 1 {currency} = ₹{exchangeRate.toFixed(2)}
                        {loadingRate && ' (fetching…)'}
                      </span>
                    )}
                  </span>
                  {currency !== 'INR' && (
                    <button type="button" onClick={e => { e.stopPropagation(); fetchRate(currency) }}
                      className="ml-2 p-1 rounded" style={{ color: 'var(--text-muted)' }}>
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </button>
                {showCurrPicker && (
                  <div className="absolute z-10 top-full mt-1 w-full rounded-xl border shadow-lg"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
                      <input autoFocus type="text" value={currSearch} onChange={e => setCurrSearch(e.target.value)}
                        placeholder="Search currency…" className="w-full px-3 py-1.5 text-xs rounded-lg border outline-none"
                        style={inputStyle} />
                    </div>
                    <div className="overflow-y-auto max-h-48 py-1">
                      {filteredCurrencies.map(c => (
                        <button key={c.code} type="button"
                          onClick={() => { setCurrency(c.code); setShowCurrPicker(false); setCurrSearch('') }}
                          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--surface-2)]"
                          style={{ color: 'var(--text)' }}>
                          <span className="font-mono text-xs w-10">{c.code}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional order notes…" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* ── Style lines ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                STYLES · {styles.length}
              </p>
              {activeStyles.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Total commission: <span className="font-semibold" style={{ color: 'var(--brand)' }}>
                    ₹{totalCommInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-3">
              {styles.map((s, i) => {
                const { total, comm } = computeStyleAmounts(s, exchangeRate, currency)
                const sym = currency !== 'INR' ? currency + ' ' : '₹'
                return (
                  <div key={i} className="rounded-xl border p-3 space-y-2.5"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    <div className="flex items-center justify-between">
                      <input type="text" value={s.style_ref} onChange={e => updateStyle(i, { style_ref: e.target.value })}
                        placeholder="Style ref / code…"
                        className="text-sm font-medium bg-transparent border-0 outline-none flex-1"
                        style={{ color: 'var(--text)' }} />
                      <div className="flex items-center gap-2 shrink-0">
                        <select value={s.order_status}
                          onChange={e => updateStyle(i, { order_status: e.target.value as OrderStatus })}
                          className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_COLORS[s.order_status]}`}>
                          {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(st => (
                            <option key={st} value={st}>{ORDER_STATUS_LABELS[st]}</option>
                          ))}
                        </select>
                        {styles.length > 1 && (
                          <button onClick={() => removeStyle(i)} style={{ color: 'var(--text-faint)' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Qty</label>
                        <input type="number" min="0" step="1" value={s.quantity}
                          onChange={e => updateStyle(i, { quantity: e.target.value })}
                          placeholder="0" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                          style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Rate / pc ({currency})</label>
                        <input type="number" min="0" step="0.01" value={s.rate_per_piece}
                          onChange={e => updateStyle(i, { rate_per_piece: e.target.value })}
                          placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                          style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Total</label>
                        <div className="px-2 py-1.5 rounded-lg border text-xs" style={{ ...inputStyle, color: 'var(--text-muted)' }}>
                          {total > 0 ? `${sym}${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Commission type</label>
                        <select value={s.commission_type}
                          onChange={e => updateStyle(i, { commission_type: e.target.value as CommissionType })}
                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={inputStyle}>
                          <option value="percentage">%</option>
                          <option value="per_piece">Per piece</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                          {s.commission_type === 'percentage' ? '%' : `${currency}`}
                        </label>
                        <input type="number" min="0" step="0.01" value={s.commission_value}
                          onChange={e => updateStyle(i, { commission_value: e.target.value })}
                          placeholder={s.commission_type === 'percentage' ? '10' : '0.00'}
                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Commission</label>
                        <div className="px-2 py-1.5 rounded-lg border text-xs font-medium"
                          style={{ ...inputStyle, color: 'var(--brand)' }}>
                          {comm > 0 ? `${sym}${comm.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>ETD</label>
                        <input type="date" value={s.etd} onChange={e => updateStyle(i, { etd: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Style notes</label>
                        <input type="text" value={s.notes} onChange={e => updateStyle(i, { notes: e.target.value })}
                          placeholder="Optional…" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                          style={inputStyle} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={addStyle} type="button"
              className="mt-3 w-full py-2.5 rounded-xl border border-dashed text-sm flex items-center justify-center gap-2 transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <Plus className="w-4 h-4" /> Add style
            </button>
          </div>

          <button onClick={handleSubmit} disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create order'}
          </button>
        </div>
      </div>
    </div>
  )
}
