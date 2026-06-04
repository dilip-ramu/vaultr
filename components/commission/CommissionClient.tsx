'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Plus, Upload, FileText, CheckCircle2, Clock, TrendingUp,
  RotateCcw, Square, CheckSquare, X, ChevronDown, ChevronRight,
  AlertCircle,
} from 'lucide-react'
import type { CommissionOrder, CommissionStyle, OrderStatus, Customer, Account } from '@/lib/types'
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

function fmtForeign(n: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

const STATUS_PILL: Record<OrderStatus, string> = {
  backlog:   'bg-gray-100 text-gray-600',
  current:   'bg-blue-100 text-blue-700',
  shipped:   'bg-amber-100 text-amber-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

// ── Bulk receive modal ────────────────────────────────────────────────────────
function BulkReceiveModal({ styles, orders, accounts, onDone, onClose }: {
  styles: CommissionStyle[]
  orders: CommissionOrder[]
  accounts: Account[]
  onDone: (updatedStyles: CommissionStyle[], txnId: string) => void
  onClose: () => void
}) {
  const expectedTotal = styles.reduce((s, x) => s + x.commission_inr, 0)
  const [accountId,    setAccountId]    = useState(accounts[0]?.id ?? '')
  const [actualAmount, setActualAmount] = useState(expectedTotal.toFixed(2))
  const [receiveDate,  setReceiveDate]  = useState(new Date().toISOString().split('T')[0])
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const actual     = parseFloat(actualAmount) || 0
  const adjustment = actual - expectedTotal

  const handleConfirm = async () => {
    if (!accountId) { setError('Select an account'); return }
    if (actual <= 0) { setError('Enter amount received'); return }
    setSaving(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Build notes with style breakdown
    const lines = styles.map(s => {
      const order = orders.find(o => o.id === s.order_id)
      const cust  = order?.customer as Customer | undefined
      return `${cust?.name ?? '—'} | ${order?.order_number ?? '—'} | ${s.style_ref ?? '—'} | ₹${s.commission_inr.toFixed(2)}`
    }).join('\n')

    const txnNotes = [
      `Commission: ${styles.length} style(s)`,
      notes.trim() || null,
      `Expected ₹${expectedTotal.toFixed(2)}${Math.abs(adjustment) > 0.01 ? ` | Adj ₹${adjustment.toFixed(2)}` : ''}`,
      '---', lines,
    ].filter(Boolean).join('\n').slice(0, 500)

    const { data: txn, error: txErr } = await supabase
      .from('transactions')
      .insert({ user_id: user!.id, account_id: accountId, type: 'income', amount: actual, date: receiveDate, notes: txnNotes })
      .select('id').single()

    if (txErr) { setError(txErr.message); setSaving(false); return }

    const { error: upErr } = await supabase
      .from('commission_styles')
      .update({ order_status: 'received', received_date: receiveDate, linked_transaction_id: txn.id })
      .in('id', styles.map(s => s.id))

    if (upErr) { setError(upErr.message); setSaving(false); return }

    const updated = styles.map(s => ({
      ...s, order_status: 'received' as const, received_date: receiveDate, linked_transaction_id: txn.id,
    }))
    onDone(updated, txn.id)
  }

  const iStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Mark as received</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{styles.length} style{styles.length !== 1 ? 's' : ''}</p>
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

          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expected commission</p>
            <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{formatCurrency(expectedTotal)}</p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Amount actually received (₹)</label>
            <input type="number" min="0" step="0.01" value={actualAmount} onChange={e => setActualAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iStyle} />
            {Math.abs(adjustment) > 0.009 && (
              <p className={`text-xs mt-1 ${adjustment < 0 ? 'text-red-500' : 'text-green-600'}`}>
                {adjustment < 0 ? `Shortage: ${formatCurrency(Math.abs(adjustment))}` : `Excess: ${formatCurrency(adjustment)}`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Received into account *</label>
            <AccountChipPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Date received</label>
            <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iStyle} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reference, bank, etc." className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iStyle} />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Styles being settled</p>
            {styles.map(s => {
              const order = orders.find(o => o.id === s.order_id)
              const cust  = order?.customer as Customer | undefined
              return (
                <div key={s.id} className="flex justify-between text-xs rounded-lg px-3 py-2"
                     style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                  <span>{cust?.name ?? '—'} · {order?.order_number ?? '—'} · {s.style_ref ?? '—'}</span>
                  <span>{formatCurrency(s.commission_inr)}</span>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 pb-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
              {saving ? 'Saving…' : 'Confirm & record'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────
export default function CommissionClient({ initialOrders, customers, accounts }: Props) {
  const [orders,     setOrders]     = useState<CommissionOrder[]>(initialOrders)
  const [showForm,   setShowForm]   = useState(false)
  const [editOrder,  setEditOrder]  = useState<CommissionOrder | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [selectedStyleIds, setSelectedStyleIds] = useState<Set<string>>(new Set())
  const [showBulkReceive,  setShowBulkReceive]  = useState(false)
  const [expandedOrders,   setExpandedOrders]   = useState<Set<string>>(new Set())
  const [showDoneOrders,   setShowDoneOrders]   = useState(false)

  const filtered = useMemo(() =>
    customerFilter === 'all' ? orders : orders.filter(o => o.customer_id === customerFilter)
  , [orders, customerFilter])

  // All styles across all filtered orders
  const allStyles = useMemo(() =>
    filtered.flatMap(o => (o.styles ?? []).map(s => ({ ...s, order_id: o.id })))
  , [filtered])

  const activeStyles   = allStyles.filter(s => !['received','cancelled'].includes(s.order_status))
  const receivedStyles = allStyles.filter(s => s.order_status === 'received')

  // Orders that have at least one non-cancelled, non-received style
  const activeOrders = filtered.filter(o =>
    (o.styles ?? []).some(s => !['received','cancelled'].includes(s.order_status))
  )
  // Orders where all non-cancelled styles are received
  const doneOrders = filtered.filter(o => {
    const styles = o.styles ?? []
    const nonCancelled = styles.filter(s => s.order_status !== 'cancelled')
    return nonCancelled.length > 0 && nonCancelled.every(s => s.order_status === 'received')
  })

  const totalPending  = activeStyles.reduce((s, x) => s + x.commission_inr, 0)
  const totalReceived = receivedStyles.reduce((s, x) => s + x.commission_inr, 0)
  const thisMonth = useMemo(() => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth()
    return receivedStyles.filter(s => {
      if (!s.received_date) return false
      const d = new Date(s.received_date)
      return d.getFullYear() === y && d.getMonth() === m
    }).reduce((s, x) => s + x.commission_inr, 0)
  }, [receivedStyles])

  const selectedStyles = allStyles.filter(s => selectedStyleIds.has(s.id))

  const toggleStyle = (id: string) =>
    setSelectedStyleIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleOrder = (orderId: string) =>
    setExpandedOrders(prev => { const n = new Set(prev); n.has(orderId) ? n.delete(orderId) : n.add(orderId); return n })

  const handleOrderSaved = (order: CommissionOrder) => {
    setOrders(prev => {
      const exists = prev.find(o => o.id === order.id)
      return exists ? prev.map(o => o.id === order.id ? order : o) : [order, ...prev]
    })
    setShowForm(false); setEditOrder(null)
  }

  const handleImported = (newOrders: CommissionOrder[]) => {
    setOrders(prev => {
      const existingIds = new Set(prev.map(o => o.id))
      const toAdd = newOrders.filter(o => !existingIds.has(o.id))
      const updated = prev.map(o => {
        const imported = newOrders.find(n => n.id === o.id)
        return imported ?? o
      })
      return [...toAdd, ...updated]
    })
    setShowImport(false)
  }

  const handleBulkDone = (updatedStyles: CommissionStyle[]) => {
    const idMap = new Map(updatedStyles.map(s => [s.id, s]))
    setOrders(prev => prev.map(o => ({
      ...o,
      styles: (o.styles ?? []).map(s => idMap.has(s.id) ? idMap.get(s.id)! : s),
    })))
    setSelectedStyleIds(new Set())
    setShowBulkReceive(false)
  }

  const handleStatusChange = async (orderId: string, styleId: string, newStatus: OrderStatus) => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const order = orders.find(o => o.id === orderId)
    const style = (order?.styles ?? []).find(s => s.id === styleId)
    const termDays = order?.payment_term ? PAYMENT_TERM_DAYS[order.payment_term] : null

    const update: Partial<CommissionStyle> = {
      order_status: newStatus,
      shipped_date: newStatus === 'shipped' ? today : undefined,
      expected_payment_date: newStatus === 'shipped' && termDays
        ? new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0]
        : undefined,
    }
    await supabase.from('commission_styles').update(update).eq('id', styleId)
    setOrders(prev => prev.map(o =>
      o.id !== orderId ? o : {
        ...o,
        styles: (o.styles ?? []).map(s => s.id === styleId ? { ...s, ...update } : s),
      }
    ))
  }

  const handleUnreceiveStyle = async (orderId: string, styleId: string) => {
    if (!confirm('Undo received? This will delete the linked transaction for this style.')) return
    const supabase = createClient()
    const style = orders.find(o => o.id === orderId)?.styles?.find(s => s.id === styleId)
    if (style?.linked_transaction_id) {
      await supabase.from('transactions').delete().eq('id', style.linked_transaction_id)
    }
    await supabase.from('commission_styles')
      .update({ order_status: 'shipped', received_date: null, linked_transaction_id: null })
      .eq('id', styleId)
    setOrders(prev => prev.map(o =>
      o.id !== orderId ? o : {
        ...o,
        styles: (o.styles ?? []).map(s =>
          s.id === styleId ? { ...s, order_status: 'shipped', received_date: null, linked_transaction_id: null } : s
        ),
      }
    ))
  }

  const handleBulkPDF = () => {
    const ordersToprint = filtered.filter(o => (o.styles ?? []).length > 0)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return

    const orderSections = ordersToprint.map(order => {
      const customer = order.customer as Customer | undefined
      const styles = (order.styles ?? []).filter(s => s.order_status !== 'cancelled')
      const totalInr = styles.reduce((s, x) => s + x.commission_inr, 0)
      const isForeign = order.currency !== 'INR'

      const rows = styles.map(s => `
        <tr>
          <td>${s.style_ref ?? '—'}</td>
          <td style="text-align:right">${s.quantity.toLocaleString()}</td>
          <td style="text-align:right">${isForeign ? fmtForeign(s.rate_per_piece, order.currency) : formatCurrency(s.rate_per_piece)}</td>
          <td style="text-align:right">${isForeign ? fmtForeign(s.total_value, order.currency) : formatCurrency(s.total_value)}</td>
          <td style="text-align:right">${s.commission_percentage ? s.commission_percentage + '%' : '—'}</td>
          <td style="text-align:right">${formatCurrency(s.commission_inr)}</td>
          <td style="text-align:center">${s.etd ? formatDate(s.etd) : '—'}</td>
          <td style="text-align:center">${ORDER_STATUS_LABELS[s.order_status]}</td>
        </tr>`).join('')

      return `
        <div class="order">
          <h2>${customer?.name ?? '—'} · ${order.order_number ?? '—'}</h2>
          <p class="sub">${formatDate(order.order_date)} · ${order.payment_term?.replace(/_/g,' ') ?? '—'}
            ${isForeign ? ` · 1 ${order.currency} = ₹${order.exchange_rate?.toFixed(4)}` : ''}</p>
          <table>
            <thead><tr>
              <th>Style</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate/pc</th>
              <th style="text-align:right">Total</th><th style="text-align:right">Comm%</th>
              <th style="text-align:right">INR</th><th style="text-align:center">ETD</th><th style="text-align:center">Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
              <td colspan="5" style="font-weight:700">Order total</td>
              <td style="text-align:right;font-weight:700">${formatCurrency(totalInr)}</td>
              <td colspan="2"></td>
            </tr></tfoot>
          </table>
        </div>`
    }).join('')

    const grandTotal = ordersToprint.reduce((s, o) =>
      s + (o.styles ?? []).filter(x => x.order_status !== 'cancelled').reduce((ss, x) => ss + x.commission_inr, 0), 0)

    w.document.write(`<!DOCTYPE html><html><head><title>Commission Summary</title>
<style>
  body{font-family:Arial,sans-serif;max-width:900px;margin:24px auto;font-size:12px;color:#111}
  h1{font-size:18px;margin-bottom:2px}
  h2{font-size:14px;margin:0 0 2px;color:#111}
  .sub{color:#666;font-size:11px;margin-bottom:8px}
  .order{margin-bottom:28px;page-break-inside:avoid}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  th,td{padding:5px 8px;border:1px solid #e5e7eb;font-size:11px}
  th{background:#f9fafb;font-weight:600;text-transform:uppercase;font-size:9px;letter-spacing:.04em}
  tfoot td{background:#f0fdf4;font-weight:700}
  .grand{font-size:14px;font-weight:700;text-align:right;margin-top:12px;padding-top:12px;border-top:2px solid #111}
  .footer{margin-top:16px;font-size:10px;color:#aaa;border-top:1px solid #e5e7eb;padding-top:8px}
  @media print{body{margin:12px}.order{page-break-inside:avoid}}
</style></head><body>
<h1>Commission summary</h1>
<p class="sub">${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })} · ${ordersToprint.length} orders</p>
${orderSections}
<p class="grand">Grand total: ${formatCurrency(grandTotal)}</p>
<div class="footer">Generated by Vaultr · ${new Date().toLocaleDateString('en-IN')}</div>
</body></html>`)
    w.document.close(); w.focus()
    setTimeout(() => w.print(), 400)
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Delete this order and all its styles?')) return
    const supabase = createClient()
    await supabase.from('commission_orders').delete().eq('id', orderId)
    setOrders(prev => prev.filter(o => o.id !== orderId))
  }

  const handlePrintOrder = (order: CommissionOrder) => {
    const customer = order.customer as Customer | undefined
    const styles = (order.styles ?? []).filter(s => s.order_status !== 'cancelled')
    const totalInr = styles.reduce((s, x) => s + x.commission_inr, 0)
    const w = window.open('', '_blank', 'width=800,height=700')
    if (!w) return
    const rows = styles.map(s => `
      <tr>
        <td>${s.style_ref ?? '—'}</td>
        <td style="text-align:right">${s.quantity.toLocaleString()}</td>
        <td style="text-align:right">${order.currency !== 'INR' ? fmtForeign(s.rate_per_piece, order.currency) : formatCurrency(s.rate_per_piece)}</td>
        <td style="text-align:right">${order.currency !== 'INR' ? fmtForeign(s.total_value, order.currency) : formatCurrency(s.total_value)}</td>
        <td style="text-align:right">${s.commission_type === 'percentage' ? s.commission_percentage + '%' : order.currency !== 'INR' ? fmtForeign(s.commission_amount, order.currency) : formatCurrency(s.commission_amount)}</td>
        <td style="text-align:right">${formatCurrency(s.commission_inr)}</td>
        <td style="text-align:center">${s.etd ? formatDate(s.etd) : '—'}</td>
        <td style="text-align:center">${ORDER_STATUS_LABELS[s.order_status]}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Commission — ${order.order_number ?? order.id}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:32px auto;font-size:13px;color:#111}
  h1{font-size:18px;margin-bottom:2px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:7px 10px;border:1px solid #e5e7eb;font-size:12px}
  th{background:#f9fafb;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
  tfoot td{font-weight:700;background:#f0fdf4}
  .footer{margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #e5e7eb;padding-top:10px}
  @media print{body{margin:16px}}
</style></head><body>
<h1>Commission note</h1>
<p class="sub">
  ${customer?.name ?? '—'} · Order ${order.order_number ?? '—'} · ${formatDate(order.order_date)}<br>
  Payment term: ${order.payment_term?.replace(/_/g,' ') ?? '—'}
  ${order.currency !== 'INR' ? ` · Rate: 1 ${order.currency} = ₹${order.exchange_rate?.toFixed(4)}` : ''}
</p>
<table>
  <thead><tr>
    <th>Style</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate/pc</th>
    <th style="text-align:right">Total</th><th style="text-align:right">Commission</th>
    <th style="text-align:right">INR</th><th style="text-align:center">ETD</th><th style="text-align:center">Status</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="5">Total commission</td>
    <td style="text-align:right">${formatCurrency(totalInr)}</td>
    <td colspan="2"></td>
  </tr></tfoot>
</table>
<div class="footer">Generated by Vaultr · ${new Date().toLocaleDateString('en-IN')}</div>
</body></html>`)
    w.document.close(); w.focus()
    setTimeout(() => w.print(), 400)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Commission</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{orders.length} orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBulkPDF}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
            <FileText className="w-4 h-4" /> All PDF
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
            <Upload className="w-4 h-4" /> Import
          </button>
          <button onClick={() => { setEditOrder(null); setShowForm(true) }}
            className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-600 transition-all">
            <Plus className="w-4 h-4" /> Add order
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Pending',    value: totalPending,  color: 'text-amber-700', bg: 'bg-amber-50',  icon: <Clock className="w-4 h-4 text-amber-500" /> },
          { label: 'Received',   value: totalReceived, color: 'text-green-700', bg: 'bg-green-50',  icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
          { label: 'This month', value: thisMonth,     color: 'text-blue-700',  bg: 'bg-blue-50',   icon: <TrendingUp className="w-4 h-4 text-blue-500" /> },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-2xl p-3.5`}>
            <div className={`flex items-center gap-1.5 mb-1 ${c.color}`}>{c.icon}
              <p className="text-[10px] font-semibold uppercase tracking-wide">{c.label}</p>
            </div>
            <p className={`text-base font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filter + bulk bar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="all">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedStyleIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl border"
             style={{ background: 'var(--brand-light)', borderColor: 'var(--brand)' }}>
          <span className="text-xs font-medium flex-1" style={{ color: 'var(--brand)' }}>
            {selectedStyleIds.size} style{selectedStyleIds.size !== 1 ? 's' : ''} · {formatCurrency(selectedStyles.reduce((s, x) => s + x.commission_inr, 0))}
          </span>
          <button onClick={() => setShowBulkReceive(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
            <CheckCircle2 className="w-3 h-3" /> Mark received
          </button>
          <button onClick={() => setSelectedStyleIds(new Set())}
            className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--brand)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active orders */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No commission orders yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add an order or import from CSV</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeOrders.map(order => (
            <OrderCard key={order.id} order={order} orders={orders}
              expanded={expandedOrders.has(order.id)}
              onToggleExpand={() => toggleOrder(order.id)}
              selectedStyleIds={selectedStyleIds}
              onToggleStyle={toggleStyle}
              onStatusChange={handleStatusChange}
              onMarkReceived={styleId => { setSelectedStyleIds(new Set([styleId])); setShowBulkReceive(true) }}
              onEdit={() => { setEditOrder(order); setShowForm(true) }}
              onDelete={() => handleDeleteOrder(order.id)}
              onPrint={() => handlePrintOrder(order)}
            />
          ))}

          {/* Done section */}
          {doneOrders.length > 0 && (
            <div>
              <button onClick={() => setShowDoneOrders(v => !v)}
                className="flex items-center gap-2 w-full px-1 py-2">
                {showDoneOrders ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                                : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Received orders · {doneOrders.length}
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {formatCurrency(doneOrders.flatMap(o => o.styles ?? []).reduce((s, x) => s + x.commission_inr, 0))}
                </span>
              </button>
              {showDoneOrders && doneOrders.map(order => (
                <OrderCard key={order.id} order={order} orders={orders}
                  expanded={expandedOrders.has(order.id)}
                  onToggleExpand={() => toggleOrder(order.id)}
                  selectedStyleIds={new Set()}
                  onToggleStyle={() => {}}
                  onStatusChange={handleStatusChange}
                  onUnreceive={handleUnreceiveStyle}
                  onEdit={() => { setEditOrder(order); setShowForm(true) }}
                  onDelete={() => handleDeleteOrder(order.id)}
                  onPrint={() => handlePrintOrder(order)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <CommissionForm order={editOrder} customers={customers} accounts={accounts}
          onSaved={handleOrderSaved} onClose={() => { setShowForm(false); setEditOrder(null) }} />
      )}
      {showImport && (
        <CommissionImport customers={customers} accounts={accounts}
          onImported={handleImported} onClose={() => setShowImport(false)} />
      )}
      {showBulkReceive && selectedStyles.length > 0 && (
        <BulkReceiveModal styles={selectedStyles} orders={orders} accounts={accounts}
          onDone={handleBulkDone} onClose={() => setShowBulkReceive(false)} />
      )}
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, orders, expanded, onToggleExpand, selectedStyleIds, onToggleStyle,
  onStatusChange, onMarkReceived, onUnreceive, onEdit, onDelete, onPrint }: {
  order: CommissionOrder
  orders: CommissionOrder[]
  expanded: boolean
  onToggleExpand: () => void
  selectedStyleIds: Set<string>
  onToggleStyle: (id: string) => void
  onStatusChange: (orderId: string, styleId: string, status: OrderStatus) => void
  onMarkReceived?: (styleId: string) => void
  onUnreceive?: (orderId: string, styleId: string) => void
  onEdit: () => void
  onDelete: () => void
  onPrint: () => void
}) {
  const styles     = order.styles ?? []
  const customer   = order.customer as Customer | undefined
  const isForeign  = order.currency !== 'INR'

  const statusCounts = styles.reduce((acc, s) => {
    acc[s.order_status] = (acc[s.order_status] ?? 0) + 1
    return acc
  }, {} as Record<OrderStatus, number>)

  const activeStyleTotal = styles
    .filter(s => !['cancelled','received'].includes(s.order_status))
    .reduce((s, x) => s + x.commission_inr, 0)

  const shippedStyles = styles.filter(s => s.order_status === 'shipped')

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {/* Order header */}
      <div className="px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{customer?.name ?? '—'}</span>
              {order.order_number && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {order.order_number}
                </span>
              )}
              {order.client_name && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {order.client_name}
                </span>
              )}
              {isForeign && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {order.currency}
                </span>
              )}
              {(['shipped','current','backlog','cancelled','received'] as OrderStatus[]).map(s =>
                statusCounts[s] ? (
                  <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[s]}`}>
                    {statusCounts[s]} {ORDER_STATUS_LABELS[s].toLowerCase()}
                  </span>
                ) : null
              )}
            </div>
            <div className="flex gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{formatDate(order.order_date)}</span>
              {order.payment_term && <span>{order.payment_term.replace(/_/g,' ')}</span>}
              <span>{styles.length} style{styles.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{formatCurrency(activeStyleTotal)}</p>
            {isForeign && order.exchange_rate && (
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>₹{order.exchange_rate.toFixed(2)}/{order.currency}</p>
            )}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded: style lines */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {styles.map((style, idx) => {
            const isLast      = idx === styles.length - 1
            const isSelected  = selectedStyleIds.has(style.id)
            const isReceived  = style.order_status === 'received'
            const isCancelled = style.order_status === 'cancelled'

            return (
              <div key={style.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b' : ''}`}
                style={{ borderColor: 'var(--border)', opacity: isCancelled ? 0.5 : 1 }}>

                {/* Checkbox for non-received, non-cancelled */}
                {!isReceived && !isCancelled ? (
                  <button onClick={() => onToggleStyle(style.id)} style={{ color: isSelected ? 'var(--brand)' : 'var(--text-faint)', flexShrink: 0 }}>
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                ) : (
                  <div className="w-4 shrink-0" />
                )}

                {/* Style info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono" style={{ color: 'var(--text)' }}>
                      {style.style_ref ?? '—'}
                    </span>
                    {style.etd && (
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        ETD {formatDate(style.etd)}
                      </span>
                    )}
                    {style.expected_payment_date && !isReceived && (
                      <span className="text-[10px] text-amber-600">
                        Pay by {formatDate(style.expected_payment_date)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {style.quantity.toLocaleString()} pcs ×{' '}
                    {isForeign ? fmtForeign(style.rate_per_piece, order.currency) : formatCurrency(style.rate_per_piece)}
                    {' · '}
                    {style.commission_type === 'percentage'
                      ? `${style.commission_percentage}%`
                      : isForeign ? fmtForeign(style.commission_amount, order.currency) : formatCurrency(style.commission_amount)}
                  </div>
                </div>

                {/* Status pill — quick change */}
                {isReceived ? (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0">
                    Received
                  </span>
                ) : (
                  <select value={style.order_status}
                    onChange={e => onStatusChange(order.id, style.id, e.target.value as OrderStatus)}
                    onClick={e => e.stopPropagation()}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer shrink-0 ${STATUS_PILL[style.order_status]}`}>
                    {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(s => (
                      <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                )}

                {/* Commission amount */}
                <div className="text-right shrink-0 min-w-[72px]">
                  <p className="text-sm font-semibold" style={{ color: isCancelled ? 'var(--text-muted)' : 'var(--text)' }}>
                    {formatCurrency(style.commission_inr)}
                  </p>
                  {isForeign && (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {fmtForeign(style.commission_amount, order.currency)}
                    </p>
                  )}
                </div>

                {/* Quick actions */}
                <div className="shrink-0 flex items-center gap-1">
                  {style.order_status === 'shipped' && onMarkReceived && (
                    <button onClick={() => onMarkReceived(style.id)}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-green-500 text-white">
                      Receive
                    </button>
                  )}
                  {isReceived && onUnreceive && (
                    <button onClick={() => onUnreceive(order.id, style.id)}
                      className="px-2 py-1 rounded-lg text-[10px] bg-amber-50 text-amber-700">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Order actions */}
          <div className="flex gap-2 px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
            {shippedStyles.length > 0 && (
              <button
                onClick={() => {
                  shippedStyles.forEach(s => onToggleStyle(s.id))
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
                <CheckCircle2 className="w-3 h-3" /> Select shipped
              </button>
            )}
            <button onClick={onPrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <FileText className="w-3 h-3" /> PDF
            </button>
            <button onClick={onEdit}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Edit</button>
            <button onClick={onDelete}
              className="px-3 py-1.5 rounded-lg text-xs text-red-500"
              style={{ background: 'var(--surface-2)' }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
