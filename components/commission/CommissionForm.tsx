'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Search } from 'lucide-react'
import type { CommissionOrder, CommissionType, OrderStatus, Customer, Account, PaymentTerms } from '@/lib/types'
import { PAYMENT_TERMS_LABELS, ORDER_STATUS_LABELS, PAYMENT_TERM_DAYS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'
import { CURRENCIES } from '@/lib/currencies'

interface Props {
  order: CommissionOrder | null
  customers: Customer[]
  accounts: Account[]
  onSaved: (order: CommissionOrder) => void
  onClose: () => void
}

const COMM_TYPES: { value: CommissionType; label: string }[] = [
  { value: 'percentage', label: '% of total' },
  { value: 'per_piece',  label: 'Per piece' },
  { value: 'fixed',      label: 'Fixed total' },
]

export default function CommissionForm({ order, customers, accounts, onSaved, onClose }: Props) {
  const isEdit = !!order

  const [customerId,       setCustomerId]       = useState(order?.customer_id ?? '')
  const [accountId,        setAccountId]        = useState(order?.account_id ?? '')
  const [orderNumber,      setOrderNumber]      = useState(order?.order_number ?? '')
  const [orderDate,        setOrderDate]        = useState(order?.order_date ?? getTodayString())
  const [etd,              setEtd]              = useState(order?.etd ?? '')
  const [quantity,         setQuantity]         = useState(order?.quantity?.toString() ?? '')
  const [ratePerPiece,     setRatePerPiece]     = useState(order?.rate_per_piece?.toString() ?? '')
  const [commType,         setCommType]         = useState<CommissionType>(order?.commission_type ?? 'percentage')
  const [commPct,          setCommPct]          = useState(order?.commission_percentage?.toString() ?? '')
  const [commPerPiece,     setCommPerPiece]     = useState(order?.commission_per_piece?.toString() ?? '')
  const [commFixed,        setCommFixed]        = useState(order?.commission_fixed?.toString() ?? '')
  const [currency,         setCurrency]         = useState(order?.currency ?? 'INR')
  const [exchangeRate,     setExchangeRate]     = useState<number | null>(order?.exchange_rate ?? null)
  const [manualRate,       setManualRate]       = useState(order?.exchange_rate?.toString() ?? '')
  const [loadingRate,      setLoadingRate]      = useState(false)
  const [orderStatus,      setOrderStatus]      = useState<OrderStatus>(order?.order_status ?? 'current')
  const [paymentTerm,      setPaymentTerm]      = useState<PaymentTerms>(order?.payment_term ?? 'net_30')
  const [notes,            setNotes]            = useState(order?.notes ?? '')
  const [showCurrPicker,   setShowCurrPicker]   = useState(false)
  const [currSearch,       setCurrSearch]       = useState('')
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')

  // Auto-fetch exchange rate when currency changes
  useEffect(() => {
    if (currency === 'INR') { setExchangeRate(null); setManualRate(''); return }
    setLoadingRate(true)
    const supabase = createClient()
    supabase
      .from('currency_rates')
      .select('expended_rate, market_rate')
      .eq('currency', currency)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        const rate = data ? (data.expended_rate ?? data.market_rate) : null
        if (rate) {
          setExchangeRate(rate)
          setManualRate(rate.toFixed(4))
        } else {
          fetch('/api/exchange-rates').then(r => r.json()).then(j => {
            const r = j.rates?.[currency]
            if (r) { setExchangeRate(r); setManualRate(r.toFixed(4)) }
          }).catch(() => {})
        }
        setLoadingRate(false)
      })
  }, [currency])

  const qty    = parseFloat(quantity)    || 0
  const rate   = parseFloat(ratePerPiece) || 0
  const total  = qty * rate

  const commAmount = (() => {
    if (commType === 'percentage') {
      const pct = parseFloat(commPct) || 0
      return total * (pct / 100)
    }
    if (commType === 'per_piece') {
      const pp = parseFloat(commPerPiece) || 0
      return qty * pp
    }
    return parseFloat(commFixed) || 0
  })()

  const effectiveRate = parseFloat(manualRate) || exchangeRate || null
  const commInr = currency === 'INR' ? commAmount : (effectiveRate ? commAmount * effectiveRate : 0)

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(currSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(currSearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId)     { setError('Select a customer'); return }
    if (!quantity || !ratePerPiece) { setError('Quantity and rate are required'); return }
    if (currency !== 'INR' && !effectiveRate) { setError('Enter exchange rate'); return }

    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const today = new Date().toISOString().split('T')[0]
    const isShipped = orderStatus === 'shipped'
    const termDays  = PAYMENT_TERM_DAYS[paymentTerm]
    const expectedPayDate = isShipped && termDays
      ? new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0]
      : order?.expected_payment_date ?? null

    const payload = {
      customer_id:          customerId,
      account_id:           accountId || null,
      order_number:         orderNumber.trim() || null,
      order_date:           orderDate,
      etd:                  etd || null,
      order_status:         orderStatus,
      shipped_date:         isShipped ? (order?.shipped_date ?? today) : null,
      expected_payment_date: expectedPayDate,
      quantity:             qty,
      rate_per_piece:       rate,
      total_value:          total,
      commission_type:      commType,
      commission_percentage: commType === 'percentage' ? (parseFloat(commPct) || null) : null,
      commission_per_piece:  commType === 'per_piece'  ? (parseFloat(commPerPiece) || null) : null,
      commission_fixed:      commType === 'fixed'      ? (parseFloat(commFixed) || null) : null,
      currency,
      commission_amount:    commAmount,
      exchange_rate:        currency !== 'INR' ? effectiveRate : null,
      commission_inr:       commInr,
      payment_term:         paymentTerm,
      notes:                notes.trim() || null,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('commission_orders').update(payload).eq('id', order.id).select('*, customer:customers(*), account:accounts(id,name)').single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('commission_orders').insert({ ...payload, user_id: user!.id }).select('*, customer:customers(*), account:accounts(id,name)').single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
  const inputStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
             style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Edit Commission Entry' : 'New Commission Entry'}
          </h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Customer */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Customer *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {customers.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                No customers marked as "pays commission". Enable it in the customer directory.
              </p>
            )}
          </div>

          {/* Order number + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Order number</label>
              <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
                placeholder="e.g. ORD-001" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Order date</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* ETD + Payment term */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>ETD (delivery date)</label>
              <input type="date" value={etd} onChange={e => setEtd(e.target.value)}
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
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Order currency</label>
            <div className="relative">
              <button type="button" onClick={() => setShowCurrPicker(v => !v)}
                className={`${inputCls} text-left flex items-center justify-between`} style={inputStyle}>
                <span>{currency}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {CURRENCIES.find(c => c.code === currency)?.name}
                </span>
              </button>
              {showCurrPicker && (
                <div className="absolute z-10 top-full mt-1 w-full rounded-xl border shadow-lg"
                     style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                      <input autoFocus type="text" value={currSearch} onChange={e => setCurrSearch(e.target.value)}
                        placeholder="Search…" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none"
                        style={inputStyle} />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-48 py-1">
                    {filteredCurrencies.map(c => (
                      <button key={c.code} type="button"
                        onClick={() => { setCurrency(c.code); setShowCurrPicker(false); setCurrSearch('') }}
                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors hover:bg-[var(--surface-2)]"
                        style={{ color: 'var(--text)' }}>
                        <span className="font-mono text-xs w-10">{c.code}</span>
                        <span style={{ color: 'var(--text-muted)' }} className="text-xs">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Exchange rate (when non-INR) */}
          {currency !== 'INR' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Exchange rate — 1 {currency} = ₹
                {loadingRate && <span className="ml-1 opacity-60">fetching…</span>}
              </label>
              <input type="number" step="0.0001" min="0" value={manualRate}
                onChange={e => setManualRate(e.target.value)}
                placeholder="e.g. 88.50" className={inputCls} style={inputStyle} />
            </div>
          )}

          <div className="border-t" style={{ borderColor: 'var(--border)' }} />

          {/* Quantity + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Quantity (pcs)</label>
              <input type="number" min="0" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                placeholder="0" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Rate / piece ({currency})</label>
              <input type="number" min="0" step="0.01" value={ratePerPiece} onChange={e => setRatePerPiece(e.target.value)}
                placeholder="0.00" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Total value (read-only) */}
          {total > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-sm flex justify-between"
                 style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              <span>Total order value</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {currency !== 'INR' ? `${currency} ` : '₹'}{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Commission type */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Commission type</label>
            <div className="flex gap-2">
              {COMM_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setCommType(t.value)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                  style={commType === t.value
                    ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }
                    : { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Commission input */}
          <div>
            {commType === 'percentage' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Commission %</label>
                <input type="number" min="0" max="100" step="0.01" value={commPct} onChange={e => setCommPct(e.target.value)}
                  placeholder="e.g. 10" className={inputCls} style={inputStyle} />
              </div>
            )}
            {commType === 'per_piece' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Commission per piece ({currency})</label>
                <input type="number" min="0" step="0.01" value={commPerPiece} onChange={e => setCommPerPiece(e.target.value)}
                  placeholder="e.g. 2.50" className={inputCls} style={inputStyle} />
              </div>
            )}
            {commType === 'fixed' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Fixed commission ({currency})</label>
                <input type="number" min="0" step="0.01" value={commFixed} onChange={e => setCommFixed(e.target.value)}
                  placeholder="e.g. 5000" className={inputCls} style={inputStyle} />
              </div>
            )}

            {/* Commission preview */}
            {commAmount > 0 && (
              <div className="mt-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                {currency !== 'INR' && effectiveRate ? (
                  <span>
                    {currency} {commAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ₹{effectiveRate.toFixed(4)} ={' '}
                    <strong>₹{commInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                  </span>
                ) : (
                  <span>Commission: <strong>₹{commInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                )}
              </div>
            )}
          </div>

          {/* Account */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Deposit account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">No account selected</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Order status */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Order status</label>
            <div className="grid grid-cols-3 gap-2">
              {(['backlog', 'current', 'shipped', 'received', 'cancelled'] as OrderStatus[]).map(s => {
                const colors: Record<OrderStatus, string> = {
                  backlog: 'bg-gray-100 text-gray-600',
                  current: 'bg-blue-100 text-blue-700',
                  shipped: 'bg-amber-100 text-amber-700',
                  received: 'bg-green-100 text-green-700',
                  cancelled: 'bg-red-100 text-red-600',
                }
                const activeColors: Record<OrderStatus, string> = {
                  backlog: 'bg-gray-500 text-white',
                  current: 'bg-blue-500 text-white',
                  shipped: 'bg-amber-500 text-white',
                  received: 'bg-green-500 text-white',
                  cancelled: 'bg-red-500 text-white',
                }
                return (
                  <button key={s} type="button" onClick={() => setOrderStatus(s)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${orderStatus === s ? activeColors[s] : colors[s]}`}>
                    {ORDER_STATUS_LABELS[s]}
                  </button>
                )
              })}
            </div>
            {orderStatus === 'shipped' && paymentTerm && PAYMENT_TERM_DAYS[paymentTerm] && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Expected payment: <strong>{new Date(Date.now() + PAYMENT_TERM_DAYS[paymentTerm]! * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong> ({paymentTerm.replace(/_/g, ' ')})
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes…" className={inputCls} style={inputStyle} />
          </div>

          <button type="button" onClick={handleSubmit} disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
