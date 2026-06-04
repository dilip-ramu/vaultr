'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Plus, Upload, FileText, CheckCircle2, Clock, TrendingUp,
  RotateCcw, Square, CheckSquare, X, AlertCircle, Trash2,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import type { CommissionOrder, CommissionStyle, OrderStatus, Customer, Account } from '@/lib/types'
import { ORDER_STATUS_LABELS, PAYMENT_TERM_DAYS } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import AccountChipPicker from '@/components/shared/AccountChipPicker'

const CommissionForm   = dynamic(() => import('./CommissionForm'),   { ssr: false })
const CommissionImport = dynamic(() => import('./CommissionImport'), { ssr: false })

interface Props {}

// Flat row — one per style, carrying relevant order fields for display
interface StyleRow extends CommissionStyle {
  order: CommissionOrder
  customerName: string
  clientName: string | null
  poNumber: string | null
  currency: string
  exchangeRate: number | null
}

type SortKey = 'po_number' | 'style_ref' | 'customer' | 'etd' | 'commission_inr' | 'order_status' | 'order_date'

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
function BulkReceiveModal({ rows, accounts, onDone, onClose }: {
  rows: StyleRow[]
  accounts: Account[]
  onDone: (updatedStyles: CommissionStyle[]) => void
  onClose: () => void
}) {
  const expectedTotal = rows.reduce((s, r) => s + r.commission_inr, 0)
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

    const lines = rows.map(r =>
      `${r.customerName} | ${r.poNumber ?? '—'} | ${r.style_ref ?? '—'} | ₹${r.commission_inr.toFixed(2)}`
    ).join('\n')

    const txnNotes = [
      `Commission: ${rows.length} style(s)`,
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
      .in('id', rows.map(r => r.id))

    if (upErr) { setError(upErr.message); setSaving(false); return }

    onDone(rows.map(r => ({ ...r, order_status: 'received' as const, received_date: receiveDate, linked_transaction_id: txn.id })))
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
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{rows.length} style{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {error && <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

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

          <div className="space-y-1 max-h-40 overflow-y-auto">
            {rows.map(r => (
              <div key={r.id} className="flex justify-between text-xs rounded-lg px-3 py-2"
                   style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                <span>{r.customerName} · {r.poNumber ?? '—'} · <span className="font-mono">{r.style_ref ?? '—'}</span></span>
                <span>{formatCurrency(r.commission_inr)}</span>
              </div>
            ))}
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

// ── Sort header ───────────────────────────────────────────────────────────────
function SortTh({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th className="text-left px-3 py-2 cursor-pointer select-none whitespace-nowrap"
        style={{ color: active ? 'var(--brand)' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
        onClick={() => onSort(sortKey)}>
      <span className="flex items-center gap-1">
        {label}
        {active ? (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </span>
    </th>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────
export default function CommissionClient(_: Props) {
  const [orders,     setOrders]     = useState<CommissionOrder[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [editOrder,  setEditOrder]  = useState<CommissionOrder | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [statusFilter,   setStatusFilter]   = useState<'all' | 'active' | 'received'>('active')
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [showBulkReceive, setShowBulkReceive] = useState(false)
  const [sortKey,    setSortKey]    = useState<SortKey>('order_date')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const [ordersRes, stylesRes, customersRes, accountsRes] = await Promise.all([
          supabase.from('commission_orders')
            .select('*, customer:customers(*), account:accounts(id,name)')
            .eq('user_id', user.id)
            .order('order_date', { ascending: false }),
          supabase.from('commission_styles')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true }),
          supabase.from('customers')
            .select('*')
            .eq('user_id', user.id)
            .eq('pays_commission', true)
            .order('name'),
          supabase.from('accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('name'),
        ])

        if (ordersRes.error) throw new Error(ordersRes.error.message)
        if (stylesRes.error)  throw new Error(stylesRes.error.message)

        const stylesByOrder = new Map<string, CommissionStyle[]>()
        for (const s of (stylesRes.data ?? []) as CommissionStyle[]) {
          const list = stylesByOrder.get(s.order_id) ?? []
          list.push(s)
          stylesByOrder.set(s.order_id, list)
        }

        setOrders((ordersRes.data ?? []).map((o: any) => ({
          ...o, styles: stylesByOrder.get(o.id) ?? [],
        })))
        setCustomers(customersRes.data ?? [])
        setAccounts(accountsRes.data ?? [])
      } catch (e: any) {
        setLoadError(e.message ?? 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )
  if (loadError) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-red-500 font-semibold mb-2">Failed to load commission data</p>
      <p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 break-all">{loadError}</p>
    </div>
  )

  // Flatten all styles into a single list with order context
  const allRows = useMemo<StyleRow[]>(() => {
    return orders.flatMap(order => {
      const customerName = (order.customer as Customer | undefined)?.name ?? '—'
      return (order.styles ?? []).map(s => ({
        ...s,
        order,
        customerName,
        clientName:   order.client_name ?? null,
        poNumber:     order.order_number ?? null,
        currency:     order.currency,
        exchangeRate: order.exchange_rate ?? null,
      }))
    })
  }, [orders])

  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (customerFilter !== 'all' && r.order.customer_id !== customerFilter) return false
      if (statusFilter === 'active'   && r.order_status === 'received')   return false
      if (statusFilter === 'received' && r.order_status !== 'received')   return false
      return true
    })
  }, [allRows, customerFilter, statusFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = '', bv: string | number = ''
      if (sortKey === 'po_number')      { av = a.poNumber ?? ''; bv = b.poNumber ?? '' }
      if (sortKey === 'style_ref')      { av = a.style_ref ?? ''; bv = b.style_ref ?? '' }
      if (sortKey === 'customer')       { av = a.customerName; bv = b.customerName }
      if (sortKey === 'etd')            { av = a.etd ?? ''; bv = b.etd ?? '' }
      if (sortKey === 'commission_inr') { av = a.commission_inr; bv = b.commission_inr }
      if (sortKey === 'order_status')   { av = a.order_status; bv = b.order_status }
      if (sortKey === 'order_date')     { av = a.order.order_date; bv = b.order.order_date }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const totalPending  = allRows.filter(r => r.order_status !== 'received' && r.order_status !== 'cancelled').reduce((s, r) => s + r.commission_inr, 0)
  const totalReceived = allRows.filter(r => r.order_status === 'received').reduce((s, r) => s + r.commission_inr, 0)
  const thisMonth = useMemo(() => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth()
    return allRows.filter(r => {
      if (r.order_status !== 'received' || !r.received_date) return false
      const d = new Date(r.received_date)
      return d.getFullYear() === y && d.getMonth() === m
    }).reduce((s, r) => s + r.commission_inr, 0)
  }, [allRows])

  const selectedRows = sorted.filter(r => selected.has(r.id))
  const allSelected  = sorted.length > 0 && sorted.every(r => selected.has(r.id))

  const toggleRow = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sorted.map(r => r.id)))
  }

  const updateStyleInOrders = (updatedStyles: CommissionStyle[]) => {
    const map = new Map(updatedStyles.map(s => [s.id, s]))
    setOrders(prev => prev.map(o => ({
      ...o, styles: (o.styles ?? []).map(s => map.has(s.id) ? { ...s, ...map.get(s.id)! } : s),
    })))
  }

  const handleStatusChange = async (row: StyleRow, newStatus: OrderStatus) => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const termDays = row.order.payment_term ? PAYMENT_TERM_DAYS[row.order.payment_term] : null
    const update: Partial<CommissionStyle> = {
      order_status:  newStatus,
      shipped_date:  newStatus === 'shipped' ? today : undefined,
      expected_payment_date: newStatus === 'shipped' && termDays
        ? new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0]
        : undefined,
    }
    await supabase.from('commission_styles').update(update).eq('id', row.id)
    updateStyleInOrders([{ ...row, ...update }])
  }

  const handleUnreceive = async (row: StyleRow) => {
    if (!confirm('Undo received? This deletes the linked transaction for this style.')) return
    const supabase = createClient()
    if (row.linked_transaction_id) {
      await supabase.from('transactions').delete().eq('id', row.linked_transaction_id)
    }
    await supabase.from('commission_styles')
      .update({ order_status: 'shipped', received_date: null, linked_transaction_id: null })
      .eq('id', row.id)
    updateStyleInOrders([{ ...row, order_status: 'shipped', received_date: null, linked_transaction_id: null }])
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedRows.length} style${selectedRows.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    const supabase = createClient()
    const ids = selectedRows.map(r => r.id)
    await supabase.from('commission_styles').delete().in('id', ids)
    // Also delete any orders that now have zero styles
    const affectedOrderIds = [...new Set(selectedRows.map(r => r.order_id))]
    setOrders(prev => {
      const next = prev.map(o => {
        if (!affectedOrderIds.includes(o.id)) return o
        return { ...o, styles: (o.styles ?? []).filter(s => !ids.includes(s.id)) }
      })
      return next.filter(o => (o.styles ?? []).length > 0)
    })
    setSelected(new Set())
  }

  const handleBulkReceiveDone = (updatedStyles: CommissionStyle[]) => {
    updateStyleInOrders(updatedStyles)
    setSelected(new Set())
    setShowBulkReceive(false)
  }

  const handleBulkPDF = () => {
    const rowsToPrint = allRows.filter(r => r.order_status !== 'cancelled')
    const total = rowsToPrint.reduce((s, r) => s + r.commission_inr, 0)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    const rows = rowsToPrint.map(r => `
      <tr>
        <td>${r.customerName}</td>
        <td>${r.clientName ?? '—'}</td>
        <td>${r.poNumber ?? '—'}</td>
        <td class="mono">${r.style_ref ?? '—'}</td>
        <td style="text-align:right">${r.quantity.toLocaleString()}</td>
        <td style="text-align:right">${r.currency !== 'INR' ? fmtForeign(r.rate_per_piece, r.currency) : formatCurrency(r.rate_per_piece)}</td>
        <td style="text-align:right">${r.commission_percentage ? r.commission_percentage + '%' : '—'}</td>
        <td style="text-align:right">${formatCurrency(r.commission_inr)}</td>
        <td>${r.etd ? formatDate(r.etd) : '—'}</td>
        <td>${ORDER_STATUS_LABELS[r.order_status]}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Commission Summary</title>
<style>
  body{font-family:Arial,sans-serif;margin:24px;font-size:12px;color:#111}
  h1{font-size:16px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 8px;border:1px solid #e5e7eb;text-align:left;font-size:11px}
  th{background:#f9fafb;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.05em}
  tfoot td{font-weight:700;background:#f0fdf4}
  .mono{font-family:monospace}
  @media print{body{margin:0}}
</style></head><body>
<h1>Commission summary — ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</h1>
<table>
  <thead><tr>
    <th>Customer</th><th>Client</th><th>PO</th><th>Style</th>
    <th style="text-align:right">Qty</th><th style="text-align:right">Rate</th>
    <th style="text-align:right">Comm%</th><th style="text-align:right">INR</th>
    <th>ETD</th><th>Status</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="7" style="font-weight:700">Grand total</td>
    <td style="text-align:right">${formatCurrency(total)}</td><td colspan="2"></td></tr></tfoot>
</table>
</body></html>`)
    w.document.close(); w.focus()
    setTimeout(() => w.print(), 400)
  }

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
      return [...newOrders.filter(o => !existingIds.has(o.id)), ...prev]
    })
    setShowImport(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Commission</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{allRows.length} styles · {orders.length} orders</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handleBulkPDF}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
            <FileText className="w-4 h-4" /> PDF
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

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {(['all', 'active', 'received'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${statusFilter === f ? 'bg-brand-500 text-white border-transparent' : ''}`}
            style={statusFilter !== f ? { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' } : {}}>
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Received'}
          </button>
        ))}
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
            {selected.size} selected · {formatCurrency(selectedRows.reduce((s, r) => s + r.commission_inr, 0))}
          </span>
          {selectedRows.some(r => r.order_status === 'shipped') && (
            <button onClick={() => setShowBulkReceive(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
              <CheckCircle2 className="w-3 h-3" /> Mark received
            </button>
          )}
          <button onClick={handleBulkDelete}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())}
            className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--brand)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No styles yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add an order or import from CSV</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ background: 'var(--surface)' }}>
              <thead style={{ background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border)' }}>
                <tr>
                  <th className="px-3 py-2 w-8">
                    <button onClick={toggleAll} style={{ color: allSelected ? 'var(--brand)' : 'var(--text-faint)' }}>
                      {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <SortTh label="Style"    sortKey="style_ref"      current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="PO"       sortKey="po_number"      current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Customer" sortKey="customer"       current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Qty</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Rate</th>
                  <SortTh label="Commission" sortKey="commission_inr" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="ETD"      sortKey="etd"            current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Status"   sortKey="order_status"   current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const isSelected  = selected.has(row.id)
                  const isReceived  = row.order_status === 'received'
                  const isCancelled = row.order_status === 'cancelled'
                  const isForeign   = row.currency !== 'INR'

                  return (
                    <tr key={row.id}
                      className="border-t transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        background: isSelected ? 'var(--brand-light)' : 'var(--surface)',
                        opacity: isCancelled ? 0.5 : 1,
                      }}>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleRow(row.id)}
                          style={{ color: isSelected ? 'var(--brand)' : 'var(--text-faint)' }}>
                          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{row.style_ref ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => { setEditOrder(row.order); setShowForm(true) }}
                          className="text-xs font-mono hover:underline"
                          style={{ color: 'var(--brand)' }}>
                          {row.poNumber ?? '—'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs" style={{ color: 'var(--text)' }}>{row.customerName}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.clientName ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs" style={{ color: 'var(--text)' }}>{row.quantity.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs" style={{ color: 'var(--text)' }}>
                          {isForeign ? fmtForeign(row.rate_per_piece, row.currency) : formatCurrency(row.rate_per_piece)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold" style={{ color: isCancelled ? 'var(--text-muted)' : 'var(--text)' }}>
                          {formatCurrency(row.commission_inr)}
                        </span>
                        {isForeign && (
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {fmtForeign(row.commission_amount, row.currency)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs" style={{ color: row.etd ? 'var(--text)' : 'var(--text-faint)' }}>
                          {row.etd ? formatDate(row.etd) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {isReceived ? (
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">Received</span>
                        ) : (
                          <select value={row.order_status}
                            onChange={e => handleStatusChange(row, e.target.value as OrderStatus)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_PILL[row.order_status]}`}>
                            {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(s => (
                              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {isReceived && (
                          <button onClick={() => handleUnreceive(row)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg"
                            style={{ color: 'var(--text-muted)' }} title="Undo received">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
      {showBulkReceive && selectedRows.length > 0 && (
        <BulkReceiveModal rows={selectedRows} accounts={accounts}
          onDone={handleBulkReceiveDone} onClose={() => setShowBulkReceive(false)} />
      )}
    </div>
  )
}
