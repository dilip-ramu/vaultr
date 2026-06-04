'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Plus, Upload, FileText, CheckCircle2, Clock, TrendingUp,
  RotateCcw, Square, CheckSquare, X, AlertCircle,
} from 'lucide-react'
import type { CommissionOrder, OrderStatus, Customer, Account } from '@/lib/types'
import { ORDER_STATUS_LABELS, PAYMENT_TERM_DAYS } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import AccountChipPicker from '@/components/shared/AccountChipPicker'

const CommissionForm   = dynamic(() => import('./CommissionForm'),   { ssr: false })
const CommissionImport = dynamic(() => import('./CommissionImport'), { ssr: false })

interface Props {
  initialOrders: CommissionOrder[]
  customers: Customer[]
  accounts: Account[]
}

function fmtForeign(amount: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

const ACTIVE_STATUSES: OrderStatus[] = ['backlog', 'current', 'shipped']
const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  backlog:   { bg: 'bg-gray-100',   text: 'text-gray-600',  dot: 'bg-gray-400' },
  current:   { bg: 'bg-blue-100',   text: 'text-blue-700',  dot: 'bg-blue-500' },
  shipped:   { bg: 'bg-amber-100',  text: 'text-amber-700', dot: 'bg-amber-500' },
  received:  { bg: 'bg-green-100',  text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-600',   dot: 'bg-red-400' },
}

function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
}

// ── Bulk receive modal ────────────────────────────────────────────────────────

function BulkReceiveModal({
  orders, accounts, onDone, onClose,
}: {
  orders: CommissionOrder[]
  accounts: Account[]
  onDone: (updatedOrders: CommissionOrder[], transactionId: string) => void
  onClose: () => void
}) {
  const expectedTotal = orders.reduce((s, o) => s + o.commission_inr, 0)
  const [accountId,   setAccountId]   = useState(accounts[0]?.id ?? '')
  const [actualAmount, setActualAmount] = useState(expectedTotal.toFixed(2))
  const [receiveDate, setReceiveDate]  = useState(new Date().toISOString().split('T')[0])
  const [notes,       setNotes]        = useState('')
  const [saving,      setSaving]       = useState(false)
  const [error,       setError]        = useState('')

  const actual     = parseFloat(actualAmount) || 0
  const adjustment = actual - expectedTotal

  const handleConfirm = async () => {
    if (!accountId) { setError('Select an account'); return }
    if (actual <= 0) { setError('Enter the amount received'); return }
    setSaving(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Build PDF summary note for the transaction
    const orderLines = orders.map(o => {
      const c = o.customer as Customer | undefined
      return `${c?.name ?? '—'} | ${o.order_number ?? '—'} | Qty ${o.quantity} | ₹${o.commission_inr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    }).join('\n')
    const notesText = [
      `Commission received for ${orders.length} order(s)`,
      notes.trim() || null,
      `Expected: ₹${expectedTotal.toFixed(2)}${adjustment !== 0 ? ` | Adjustment: ₹${adjustment.toFixed(2)}` : ''}`,
      '---',
      orderLines,
    ].filter(Boolean).join('\n')

    // 2. Create a single income transaction
    const { data: txn, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id:    user!.id,
        account_id: accountId,
        type:       'income',
        amount:     actual,
        date:       receiveDate,
        notes:      notesText.slice(0, 500),
      })
      .select('id')
      .single()

    if (txErr) { setError(txErr.message); setSaving(false); return }

    // 3. Mark all selected orders as received + link transaction
    const { error: upErr } = await supabase
      .from('commission_orders')
      .update({
        order_status: 'received',
        received_date: receiveDate,
        linked_transaction_id: txn.id,
      })
      .in('id', orders.map(o => o.id))

    if (upErr) { setError(upErr.message); setSaving(false); return }

    const updated = orders.map(o => ({
      ...o, order_status: 'received' as const, received_date: receiveDate, linked_transaction_id: txn.id,
    }))
    onDone(updated, txn.id)
  }

  const inputCls   = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
  const inputStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
             style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Mark as received</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Expected total */}
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expected commission total</p>
            <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{formatCurrency(expectedTotal)}</p>
          </div>

          {/* Actual amount received */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Amount actually received (₹)
            </label>
            <input type="number" min="0" step="0.01" value={actualAmount}
              onChange={e => setActualAmount(e.target.value)}
              className={inputCls} style={inputStyle} />
            {Math.abs(adjustment) > 0.009 && (
              <p className={`text-xs mt-1 ${adjustment < 0 ? 'text-red-500' : 'text-green-600'}`}>
                {adjustment < 0
                  ? `Discount / shortage: ${formatCurrency(Math.abs(adjustment))}`
                  : `Excess received: ${formatCurrency(adjustment)}`}
              </p>
            )}
          </div>

          {/* Account */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Received into account *</label>
            <AccountChipPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Date received</label>
            <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reference, bank, etc." className={inputCls} style={inputStyle} />
          </div>

          {/* Order summary */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Orders being settled</p>
            {orders.map(o => {
              const c = o.customer as Customer | undefined
              return (
                <div key={o.id} className="flex justify-between text-xs rounded-lg px-3 py-2"
                     style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                  <span>{c?.name ?? '—'} {o.order_number ? `#${o.order_number}` : ''}</span>
                  <span>{formatCurrency(o.commission_inr)}</span>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
              {saving ? 'Saving…' : 'Confirm & create transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────

export default function CommissionClient({ initialOrders, customers, accounts }: Props) {
  const [orders,      setOrders]      = useState<CommissionOrder[]>(initialOrders)
  const [showForm,    setShowForm]    = useState(false)
  const [editOrder,   setEditOrder]   = useState<CommissionOrder | null>(null)
  const [showImport,  setShowImport]  = useState(false)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [showBulkReceive, setShowBulkReceive] = useState(false)
  const [showDone,    setShowDone]    = useState(false)

  const customerFiltered = useMemo(() =>
    customerFilter === 'all' ? orders : orders.filter(o => o.customer_id === customerFilter)
  , [orders, customerFilter])

  const activeOrders    = useMemo(() => customerFiltered.filter(o => ACTIVE_STATUSES.includes(o.order_status)), [customerFiltered])
  const receivedOrders  = useMemo(() => customerFiltered.filter(o => o.order_status === 'received'),            [customerFiltered])
  const cancelledOrders = useMemo(() => customerFiltered.filter(o => o.order_status === 'cancelled'),           [customerFiltered])

  // Group active orders by status section
  const activeByStatus = useMemo(() => {
    const groups: Partial<Record<OrderStatus, CommissionOrder[]>> = {}
    for (const o of activeOrders) {
      (groups[o.order_status] ??= []).push(o)
    }
    return (['shipped', 'current', 'backlog'] as OrderStatus[])
      .map(s => ({ status: s, items: groups[s] ?? [] }))
      .filter(g => g.items.length > 0)
  }, [activeOrders])

  const totalPending  = activeOrders.reduce((s, o) => s + o.commission_inr, 0)
  const totalReceived = receivedOrders.reduce((s, o) => s + o.commission_inr, 0)
  const thisMonth = useMemo(() => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth()
    return orders.filter(o => {
      const d = new Date(o.order_date)
      return d.getFullYear() === y && d.getMonth() === m && o.order_status === 'received'
    }).reduce((s, o) => s + o.commission_inr, 0)
  }, [orders])

  const selectedOrders = orders.filter(o => selected.has(o.id))

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleAll = () => {
    if (selected.size === activeOrders.length) setSelected(new Set())
    else setSelected(new Set(activeOrders.map(o => o.id)))
  }

  const handleStatusChange = async (order: CommissionOrder, newStatus: OrderStatus) => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const termDays = order.payment_term ? PAYMENT_TERM_DAYS[order.payment_term] : null
    const update: Partial<CommissionOrder> = {
      order_status: newStatus,
      shipped_date: newStatus === 'shipped' ? today : (newStatus === 'backlog' || newStatus === 'current' ? null : order.shipped_date),
      expected_payment_date: newStatus === 'shipped' && termDays ? addDays(termDays) : order.expected_payment_date,
    }

    await supabase.from('commission_orders').update(update).eq('id', order.id)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...update } : o))
  }

  const handleSaved = (order: CommissionOrder) => {
    setOrders(prev => {
      const exists = prev.find(o => o.id === order.id)
      return exists ? prev.map(o => o.id === order.id ? order : o) : [order, ...prev]
    })
    setShowForm(false); setEditOrder(null)
  }

  const handleImported = (newOrders: CommissionOrder[]) => {
    setOrders(prev => [...newOrders, ...prev])
    setShowImport(false)
  }

  const handleBulkReceiveDone = (updatedOrders: CommissionOrder[]) => {
    const ids = new Set(updatedOrders.map(o => o.id))
    setOrders(prev => prev.map(o => ids.has(o.id) ? (updatedOrders.find(u => u.id === o.id) ?? o) : o))
    setSelected(new Set())
    setShowBulkReceive(false)
  }

  const handleUnreceive = async (order: CommissionOrder) => {
    if (!confirm('Mark as unrecieved? This will delete the linked transaction.')) return
    const supabase = createClient()
    if (order.linked_transaction_id) {
      await supabase.from('transactions').delete().eq('id', order.linked_transaction_id)
    }
    await supabase.from('commission_orders')
      .update({ order_status: 'shipped', received_date: null, linked_transaction_id: null })
      .eq('id', order.id)
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, order_status: 'shipped', received_date: null, linked_transaction_id: null } : o
    ))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this commission entry?')) return
    const supabase = createClient()
    const o = orders.find(x => x.id === id)
    if (o?.linked_transaction_id) {
      await supabase.from('transactions').delete().eq('id', o.linked_transaction_id)
    }
    await supabase.from('commission_orders').delete().eq('id', id)
    setOrders(prev => prev.filter(o => o.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handlePrint = (order: CommissionOrder) => {
    const customer = order.customer as Customer | undefined
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    const commInrFmt = formatCurrency(order.commission_inr)
    const foreignLine = order.currency !== 'INR' && order.exchange_rate
      ? `<tr><td>Exchange rate</td><td>1 ${order.currency} = ₹${order.exchange_rate.toFixed(4)}</td></tr>
         <tr><td>Commission (${order.currency})</td><td>${fmtForeign(order.commission_amount, order.currency)}</td></tr>`
      : ''
    w.document.write(`<!DOCTYPE html><html><head><title>Commission Note</title>
<style>
  body{font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#111;font-size:14px}
  h1{font-size:20px;margin-bottom:4px}
  .muted{color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  td,th{padding:8px 12px;border:1px solid #e5e7eb;text-align:left}
  th{background:#f9fafb;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .total{font-weight:700;font-size:18px;margin-top:16px;color:#065f46}
  .footer{margin-top:32px;font-size:12px;color:#999;border-top:1px solid #e5e7eb;padding-top:12px}
  @media print{body{margin:20px}}
</style></head><body>
<h1>Commission Note</h1>
<p class="muted">Order #${order.order_number ?? '—'} · ${formatDate(order.order_date)}</p>
<table>
  <tr><th>Field</th><th>Value</th></tr>
  <tr><td>Customer</td><td>${customer?.name ?? '—'}</td></tr>
  <tr><td>Order number</td><td>${order.order_number ?? '—'}</td></tr>
  <tr><td>Order date</td><td>${formatDate(order.order_date)}</td></tr>
  ${order.etd ? `<tr><td>ETD</td><td>${formatDate(order.etd)}</td></tr>` : ''}
  <tr><td>Quantity</td><td>${order.quantity.toLocaleString('en-IN')} pcs</td></tr>
  <tr><td>Rate / piece</td><td>${order.currency !== 'INR' ? fmtForeign(order.rate_per_piece, order.currency) : formatCurrency(order.rate_per_piece)}</td></tr>
  <tr><td>Total order value</td><td>${order.currency !== 'INR' ? fmtForeign(order.total_value, order.currency) : formatCurrency(order.total_value)}</td></tr>
  <tr><td>Commission type</td><td>${
    order.commission_type === 'percentage' ? `${order.commission_percentage}%` :
    order.commission_type === 'per_piece'  ? `${order.currency !== 'INR' ? fmtForeign(order.commission_per_piece ?? 0, order.currency) : formatCurrency(order.commission_per_piece ?? 0)} / pc` :
    formatCurrency(order.commission_fixed ?? 0)
  }</td></tr>
  ${foreignLine}
  <tr><td>Payment term</td><td>${order.payment_term?.replace(/_/g, ' ') ?? '—'}</td></tr>
  <tr><td>Status</td><td>${order.order_status === 'received' ? `Received ${order.received_date ? formatDate(order.received_date) : ''}` : ORDER_STATUS_LABELS[order.order_status]}</td></tr>
</table>
<p class="total">Commission: ${commInrFmt}</p>
<div class="footer">Generated by Vaultr · ${new Date().toLocaleDateString('en-IN')}</div>
</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Commission</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{orders.length} entries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
            <Upload className="w-4 h-4" /> Import
          </button>
          <button onClick={() => { setEditOrder(null); setShowForm(true) }}
            className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Pending',    value: totalPending,  color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Clock className="w-4 h-4 text-amber-500" /> },
          { label: 'Received',   value: totalReceived, color: 'text-green-700',  bg: 'bg-green-50',  icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
          { label: 'This month', value: thisMonth,     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: <TrendingUp className="w-4 h-4 text-blue-500" /> },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-2xl p-3.5`}>
            <div className={`flex items-center gap-1.5 mb-1 ${c.color}`}>{c.icon}
              <p className="text-[10px] font-semibold uppercase tracking-wide">{c.label}</p>
            </div>
            <p className={`text-base font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <button onClick={toggleAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
          {selected.size === activeOrders.length && activeOrders.length > 0
            ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {selected.size > 0 ? `${selected.size} selected` : 'Select all active'}
        </button>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="all">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl border"
             style={{ background: 'var(--brand-light)', borderColor: 'var(--brand)' }}>
          <span className="text-xs font-medium flex-1" style={{ color: 'var(--brand)' }}>
            {selected.size} order{selected.size !== 1 ? 's' : ''} · {formatCurrency(selectedOrders.reduce((s, o) => s + o.commission_inr, 0))}
          </span>
          <button onClick={() => setShowBulkReceive(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
            <CheckCircle2 className="w-3 h-3" /> Mark received
          </button>
          <button onClick={() => setSelected(new Set())}
            className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--brand)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active orders grouped by status */}
      {activeOrders.length === 0 && receivedOrders.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No commission entries</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add an entry or import from CSV</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeByStatus.map(({ status, items }) => (
            <div key={status}>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status].dot}`} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {ORDER_STATUS_LABELS[status]} · {items.length}
                  </p>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatCurrency(items.reduce((s, o) => s + o.commission_inr, 0))}
                </p>
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {items.map((order, idx) => (
                  <OrderRow key={order.id} order={order} isLast={idx === items.length - 1}
                    selected={selected.has(order.id)}
                    onToggle={() => toggleSelect(order.id)}
                    onEdit={() => { setEditOrder(order); setShowForm(true) }}
                    onDelete={() => handleDelete(order.id)}
                    onStatusChange={s => handleStatusChange(order, s)}
                    onMarkReceived={() => { setSelected(new Set([order.id])); setShowBulkReceive(true) }}
                    onPrint={() => handlePrint(order)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Done (received) section */}
          {receivedOrders.length > 0 && (
            <div>
              <button onClick={() => setShowDone(v => !v)}
                className="flex items-center justify-between w-full mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Received · {receivedOrders.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatCurrency(receivedOrders.reduce((s, o) => s + o.commission_inr, 0))}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{showDone ? '▲' : '▼'}</span>
                </div>
              </button>
              {showDone && (
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  {receivedOrders.map((order, idx) => (
                    <OrderRow key={order.id} order={order} isLast={idx === receivedOrders.length - 1}
                      selected={false} onToggle={() => {}}
                      onEdit={() => { setEditOrder(order); setShowForm(true) }}
                      onDelete={() => handleDelete(order.id)}
                      onStatusChange={s => handleStatusChange(order, s)}
                      onUnreceive={() => handleUnreceive(order)}
                      onPrint={() => handlePrint(order)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <CommissionForm order={editOrder} customers={customers} accounts={accounts}
          onSaved={handleSaved} onClose={() => { setShowForm(false); setEditOrder(null) }} />
      )}
      {showImport && (
        <CommissionImport customers={customers} accounts={accounts}
          onImported={handleImported} onClose={() => setShowImport(false)} />
      )}
      {showBulkReceive && selectedOrders.length > 0 && (
        <BulkReceiveModal
          orders={selectedOrders}
          accounts={accounts}
          onDone={handleBulkReceiveDone}
          onClose={() => setShowBulkReceive(false)}
        />
      )}
    </div>
  )
}

// ── Order row ─────────────────────────────────────────────────────────────────

const ACTIVE_STATUS_OPTIONS: OrderStatus[] = ['backlog', 'current', 'shipped', 'cancelled']

function OrderRow({ order, isLast, selected, onToggle, onEdit, onDelete, onStatusChange, onMarkReceived, onUnreceive, onPrint }: {
  order: CommissionOrder
  isLast: boolean
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (s: OrderStatus) => void
  onMarkReceived?: () => void
  onUnreceive?: () => void
  onPrint: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isForeign  = order.currency !== 'INR'
  const customer   = order.customer as Customer | undefined
  const isReceived = order.order_status === 'received'
  const sc         = STATUS_COLORS[order.order_status]

  return (
    <div className={`${!isLast ? 'border-b' : ''}`} style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox (only for active orders) */}
        {!isReceived ? (
          <button onClick={onToggle} className="shrink-0" style={{ color: selected ? 'var(--brand)' : 'var(--text-faint)' }}>
            {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {customer?.name ?? '—'}
            </span>
            {order.order_number && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                #{order.order_number}
              </span>
            )}
          </div>
          <div className="flex gap-3 mt-0.5 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span>{formatDate(order.order_date)}</span>
            {order.etd && <span>ETD: {formatDate(order.etd)}</span>}
            {order.expected_payment_date && !isReceived && (
              <span className="text-amber-600">Pay by: {formatDate(order.expected_payment_date)}</span>
            )}
            <span>{order.quantity.toLocaleString()} pcs</span>
          </div>
        </div>

        {/* Status pill — quick change */}
        {!isReceived ? (
          <select
            value={order.order_status}
            onChange={e => onStatusChange(e.target.value as OrderStatus)}
            onClick={e => e.stopPropagation()}
            className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer shrink-0 ${sc.bg} ${sc.text}`}
          >
            {ACTIVE_STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0">
            Received
          </span>
        )}

        {/* Amount */}
        <div className="text-right shrink-0 ml-1">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(order.commission_inr)}</p>
          {isForeign && (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {fmtForeign(order.commission_amount, order.currency)}
            </p>
          )}
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="pt-2 flex gap-2 flex-wrap">
            {!isReceived && order.order_status === 'shipped' && onMarkReceived && (
              <button onClick={onMarkReceived}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
                <CheckCircle2 className="w-3 h-3" /> Mark received
              </button>
            )}
            {isReceived && onUnreceive && (
              <button onClick={onUnreceive}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700">
                <RotateCcw className="w-3 h-3" /> Undo received
              </button>
            )}
            <button onClick={onPrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <FileText className="w-3 h-3" /> PDF
            </button>
            <button onClick={onEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Edit</button>
            <button onClick={onDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500"
              style={{ background: 'var(--surface-2)' }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
