'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus, Upload, FileText, CheckCircle2, Clock, TrendingUp,
  RotateCcw, Square, CheckSquare, X, AlertCircle, Trash2,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import type { CommissionOrder, CommissionStyle, OrderStatus, Customer, Account } from '@/lib/types'
import { ORDER_STATUS_LABELS, PAYMENT_TERM_DAYS } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// Dynamically loaded to keep initial bundle small
import dynamic from 'next/dynamic'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
const CommissionForm   = dynamic(() => import('./CommissionForm'),   { ssr: false })
const CommissionImport = dynamic(() => import('./CommissionImport'), { ssr: false })

type SortKey = 'po_number' | 'style_ref' | 'customer' | 'etd' | 'commission_inr' | 'order_status' | 'order_date'

interface StyleRow extends CommissionStyle {
  order: CommissionOrder
  customerName: string
  clientName: string | null
  poNumber: string | null
}

function fmtForeign(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch { return `${currency} ${n}` }
}

const STATUS_PILL: Record<OrderStatus, string> = {
  backlog:   'bg-gray-100 text-gray-600',
  current:   'bg-blue-100 text-blue-700',
  shipped:   'bg-amber-100 text-amber-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

// ── Simple account select (no external imports) ───────────────────────────────
function AccountSelect({ accounts, value, onChange }: {
  accounts: Account[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
      style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      <option value="">Select account…</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
}

// ── Bulk receive modal ────────────────────────────────────────────────────────
function BulkReceiveModal({ rows, accounts, onDone, onClose }: {
  rows: StyleRow[]
  accounts: Account[]
  onDone: (updated: CommissionStyle[]) => void
  onClose: () => void
}) {
  const expected = rows.reduce((s, r) => s + r.commission_inr, 0)
  const [accountId,  setAccountId]  = useState(accounts[0]?.id ?? '')
  const [actual,     setActual]     = useState(expected.toFixed(2))
  const [date,       setDate]       = useState(new Date().toISOString().split('T')[0])
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')

  const actualNum  = parseFloat(actual) || 0
  const adjustment = actualNum - expected

  const confirm = async () => {
    if (!accountId) { setErr('Select an account'); return }
    if (actualNum <= 0) { setErr('Enter amount received'); return }
    setSaving(true); setErr('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const txnNotes = [
      `Commission: ${rows.length} style(s)`,
      notes.trim() || null,
      `Expected ${formatCurrency(expected)}${Math.abs(adjustment) > 0.01 ? ` | Adj ${formatCurrency(Math.abs(adjustment))}` : ''}`,
      '---',
      ...rows.map(r => `${r.customerName} | ${r.poNumber ?? '—'} | ${r.style_ref ?? '—'} | ${formatCurrency(r.commission_inr)}`),
    ].filter(Boolean).join('\n').slice(0, 500)

    const { data: txn, error: tErr } = await supabase.from('transactions')
      .insert({ user_id: user!.id, account_id: accountId, type: 'income', amount: actualNum, date, notes: txnNotes })
      .select('id').single()
    if (tErr) { setErr(tErr.message); setSaving(false); return }

    const { error: uErr } = await supabase.from('commission_styles')
      .update({ order_status: 'received', received_date: date, linked_transaction_id: txn.id })
      .in('id', rows.map(r => r.id))
    if (uErr) { setErr(uErr.message); setSaving(false); return }

    onDone(rows.map(r => ({ ...r, order_status: 'received' as const, received_date: date, linked_transaction_id: txn.id })))
  }

  const iS = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Mark as received</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} style{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {err && <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 shrink-0" />{err}</div>}
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expected commission</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(expected)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Amount actually received (₹)</label>
            <input type="number" min="0" step="0.01" value={actual} onChange={e => setActual(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iS} />
            {Math.abs(adjustment) > 0.009 && (
              <p className={`text-xs mt-1 ${adjustment < 0 ? 'text-red-500' : 'text-green-600'}`}>
                {adjustment < 0 ? `Shortage: ${formatCurrency(Math.abs(adjustment))}` : `Excess: ${formatCurrency(adjustment)}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Account *</label>
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Date received</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iS} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reference, bank…" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={iS} />
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {rows.map(r => (
              <div key={r.id} className="flex justify-between text-xs rounded-lg px-3 py-2"
                   style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
                <span>{r.customerName} · {r.poNumber ?? '—'} · <span className="font-mono">{r.style_ref ?? '—'}</span></span>
                <span className="ml-2 shrink-0">{formatCurrency(r.commission_inr)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pb-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={confirm} disabled={saving}
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
function SortTh({ label, col, current, dir, onSort }: {
  label: string; col: SortKey; current: SortKey; dir: 'asc'|'desc'; onSort:(k:SortKey)=>void
}) {
  const active = current === col
  return (
    <th onClick={() => onSort(col)} className="text-left px-3 py-2 cursor-pointer select-none whitespace-nowrap"
        style={{ color: active ? 'var(--brand)' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      <span className="flex items-center gap-1">
        {label}
        {active && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CommissionClient() {
  const [orders,    setOrders]    = useState<CommissionOrder[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadErr,   setLoadErr]   = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const [editOrder, setEditOrder] = useState<CommissionOrder | null>(null)
  const [showImport,setShowImport]= useState(false)
  const [custFilter,setCustFilter]= useState('all')
  const [statFilter,setStatFilter]= useState<'all'|'active'|OrderStatus>('active')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [showRecv,  setShowRecv]  = useState(false)
  const [sortKey,   setSortKey]   = useState<SortKey>('order_date')
  const [sortDir,   setSortDir]   = useState<'asc'|'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [oR, sR, cR, aR] = await Promise.all([
        supabase.from('commission_orders').select('*, customer:customers(*), account:accounts(id,name)').eq('user_id', user.id).order('order_date', { ascending: false }),
        supabase.from('commission_styles').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('customers').select('*').eq('user_id', user.id).eq('pays_commission', true).order('name'),
        supabase.from('accounts').select('id,name,type').eq('user_id', user.id).eq('is_active', true).order('name'),
      ])
      if (oR.error) throw new Error(oR.error.message)
      if (sR.error) throw new Error(sR.error.message)
      const byOrder = new Map<string, CommissionStyle[]>()
      for (const s of (sR.data ?? []) as CommissionStyle[]) {
        const arr = byOrder.get(s.order_id) ?? []; arr.push(s); byOrder.set(s.order_id, arr)
      }
      // Supabase returns rows without the derived `styles` array — we stitch
      // them in from `byOrder`, so we can safely narrow to CommissionOrder here.
      setOrders(((oR.data ?? []) as Omit<CommissionOrder, 'styles'>[]).map(o => ({ ...o, styles: byOrder.get(o.id) ?? [] })))
      setCustomers((cR.data ?? []) as Customer[])
      setAccounts((aR.data ?? []) as Account[])
    } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Unknown error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived flat list ──────────────────────────────────────────────────────
  const allRows = useMemo<StyleRow[]>(() =>
    orders.flatMap(order => (order.styles ?? []).map(s => ({
      ...s, order,
      customerName: (order.customer as Customer | undefined)?.name ?? '—',
      clientName:   order.client_name ?? null,
      poNumber:     order.order_number ?? null,
    })))
  , [orders])

  const filtered = useMemo(() => allRows.filter(r => {
    if (custFilter !== 'all' && r.order.customer_id !== custFilter) return false
    if (statFilter === 'active' && r.order_status === 'received') return false
    if (statFilter !== 'all' && statFilter !== 'active' && r.order_status !== statFilter) return false
    return true
  }), [allRows, custFilter, statFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av: string|number = '', bv: string|number = ''
    if (sortKey === 'po_number')      { av = a.poNumber ?? '';   bv = b.poNumber ?? '' }
    if (sortKey === 'style_ref')      { av = a.style_ref ?? '';  bv = b.style_ref ?? '' }
    if (sortKey === 'customer')       { av = a.customerName;     bv = b.customerName }
    if (sortKey === 'etd')            { av = a.etd ?? '';        bv = b.etd ?? '' }
    if (sortKey === 'commission_inr') { av = a.commission_inr;   bv = b.commission_inr }
    if (sortKey === 'order_status')   { av = a.order_status;     bv = b.order_status }
    if (sortKey === 'order_date')     { av = a.order.order_date; bv = b.order.order_date }
    return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1)
  }), [filtered, sortKey, sortDir])

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') } }

  const totalPending  = allRows.filter(r => !['received','cancelled'].includes(r.order_status)).reduce((s,r)=>s+r.commission_inr,0)
  const totalReceived = allRows.filter(r => r.order_status === 'received').reduce((s,r)=>s+r.commission_inr,0)
  const thisMonth = useMemo(()=>{
    const now=new Date(),y=now.getFullYear(),m=now.getMonth()
    return allRows.filter(r=>{if(r.order_status!=='received'||!r.received_date)return false;const d=new Date(r.received_date);return d.getFullYear()===y&&d.getMonth()===m}).reduce((s,r)=>s+r.commission_inr,0)
  },[allRows])

  const selectedRows = sorted.filter(r => selected.has(r.id))
  const allSel = sorted.length > 0 && sorted.every(r => selected.has(r.id))
  const toggleRow = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(sorted.map(r=>r.id)))

  const patchStyle = (updated: Partial<CommissionStyle> & { id: string }) =>
    setOrders(prev => prev.map(o => ({ ...o, styles: (o.styles??[]).map(s => s.id===updated.id ? {...s,...updated} : s) })))

  const handleStatusChange = async (row: StyleRow, newStatus: OrderStatus) => {
    // If this row is part of a multi-selection, apply to all selected rows
    if (selected.has(row.id) && selected.size > 1) { await handleBulkStatus(newStatus); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    const termDays = row.order.payment_term ? PAYMENT_TERM_DAYS[row.order.payment_term] : null
    // Narrow shape — only fields the DB update touches. Was `any`, which hid
    // typos and let unrelated fields sneak into the write.
    const patch: { order_status: OrderStatus; shipped_date?: string; expected_payment_date?: string } = { order_status: newStatus }
    if (newStatus === 'shipped') { patch.shipped_date = today; if (termDays) patch.expected_payment_date = new Date(Date.now()+termDays*86400000).toISOString().split('T')[0] }
    await supabase.from('commission_styles').update(patch).eq('id', row.id).eq('user_id', user.id)
    patchStyle({ id: row.id, ...patch })
  }

  const handleUnreceive = async (row: StyleRow) => {
    if (!await confirmDialog('Undo received? This deletes the linked transaction.')) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Defensive user_id filter on both writes — RLS + client-side belt.
    if (row.linked_transaction_id) await supabase.from('transactions').delete().eq('id', row.linked_transaction_id).eq('user_id', user.id)
    await supabase.from('commission_styles').update({ order_status: 'shipped', received_date: null, linked_transaction_id: null }).eq('id', row.id).eq('user_id', user.id)
    patchStyle({ id: row.id, order_status: 'shipped', received_date: null, linked_transaction_id: null })
  }

  const handleBulkStatus = async (newStatus: OrderStatus) => {
    const rows = selectedRows.filter(r => r.order_status !== 'received')
    if (rows.length === 0) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    if (newStatus === 'shipped') {
      // expected_payment_date depends on each order's payment term — group rows by it
      const groups = new Map<string, { expected: string | null; ids: string[] }>()
      for (const r of rows) {
        const termDays = r.order.payment_term ? PAYMENT_TERM_DAYS[r.order.payment_term] : null
        const expected = termDays ? new Date(Date.now() + termDays * 86400000).toISOString().split('T')[0] : null
        const key = expected ?? 'none'
        const g = groups.get(key) ?? { expected, ids: [] }
        g.ids.push(r.id); groups.set(key, g)
      }
      await Promise.all([...groups.values()].map(g =>
        supabase.from('commission_styles')
          .update({ order_status: 'shipped', shipped_date: today, ...(g.expected ? { expected_payment_date: g.expected } : {}) })
          .in('id', g.ids)
          .eq('user_id', user.id)
      ))
      for (const g of groups.values()) {
        for (const id of g.ids) {
          patchStyle({ id, order_status: 'shipped', shipped_date: today, ...(g.expected ? { expected_payment_date: g.expected } : {}) })
        }
      }
    } else {
      await supabase.from('commission_styles').update({ order_status: newStatus }).in('id', rows.map(r => r.id)).eq('user_id', user.id)
      rows.forEach(r => patchStyle({ id: r.id, order_status: newStatus }))
    }
    setSelected(new Set())
  }

  const handleBulkDelete = async () => {
    if (!await confirmDialog(`Delete ${selectedRows.length} style${selectedRows.length!==1?'s':''}?`)) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('commission_styles').delete().in('id', selectedRows.map(r=>r.id)).eq('user_id', user.id)
    const ids = new Set(selectedRows.map(r=>r.id))
    setOrders(prev => prev.map(o => ({...o, styles:(o.styles??[]).filter(s=>!ids.has(s.id))})).filter(o=>(o.styles??[]).length>0))
    setSelected(new Set())
  }

  const handleBulkReceiveDone = (updated: CommissionStyle[]) => {
    updated.forEach(s => patchStyle(s))
    setSelected(new Set()); setShowRecv(false)
  }

  const handlePDF = () => {
    // Export what's currently visible (respects status + customer filters and sort);
    // if rows are selected, export only those
    const rows = selectedRows.length > 0 ? selectedRows : sorted
    const total = rows.reduce((s,r)=>s+r.commission_inr,0)
    const w = window.open('','_blank','width=900,height=700')
    if (!w) return
    const trs = rows.map(r=>`<tr><td>${r.customerName}</td><td>${r.clientName??'—'}</td><td>${r.poNumber??'—'}</td><td class="mono">${r.style_ref??'—'}</td><td align="right">${(r.quantity ?? 0).toLocaleString()}</td><td align="right">${r.order.currency!=='INR'?fmtForeign(r.rate_per_piece,r.order.currency):formatCurrency(r.rate_per_piece)}</td><td align="right">${r.commission_percentage?r.commission_percentage+'%':'—'}</td><td align="right">${formatCurrency(r.commission_inr)}</td><td>${r.etd?formatDate(r.etd):'—'}</td><td>${ORDER_STATUS_LABELS[r.order_status]}</td></tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Commission</title><style>body{font-family:Arial,sans-serif;margin:24px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border:1px solid #e5e7eb;font-size:11px}th{background:#f9fafb;font-weight:700;text-transform:uppercase;font-size:9px}.mono{font-family:monospace}tfoot td{font-weight:700;background:#f0fdf4}</style></head><body><h2 style="margin-bottom:12px">Commission summary</h2><table><thead><tr><th>Customer</th><th>Client</th><th>PO</th><th>Style</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">Comm%</th><th align="right">INR</th><th>ETD</th><th>Status</th></tr></thead><tbody>${trs}</tbody><tfoot><tr><td colspan="7">Grand total</td><td align="right">${formatCurrency(total)}</td><td colspan="2"></td></tr></tfoot></table></body></html>`)
    w.document.close(); w.focus(); setTimeout(()=>w.print(),400)
  }

  const handleOrderSaved = (order: CommissionOrder) => {
    setOrders(prev => { const ex=prev.find(o=>o.id===order.id); return ex?prev.map(o=>o.id===order.id?order:o):[order,...prev] })
    setShowForm(false); setEditOrder(null)
  }

  const handleImported = (newOrders: CommissionOrder[]) => {
    setOrders(prev => { const ids=new Set(prev.map(o=>o.id)); return [...newOrders.filter(o=>!ids.has(o.id)),...prev] })
    setShowImport(false)
  }

  if (loading) return <div className="flex justify-center py-24 text-sm" style={{color:'var(--text-muted)'}}>Loading…</div>
  if (loadErr)  return <div className="max-w-xl mx-auto px-4 py-16 text-center"><p className="text-red-500 font-semibold mb-2">Error</p><p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 break-all">{loadErr}</p></div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{color:'var(--text)'}}>Incoming</h1>
          <p className="text-sm" style={{color:'var(--text-muted)'}}>{allRows.length} styles · {orders.length} orders</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handlePDF} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all" style={{borderColor:'var(--border)',color:'var(--text-muted)',background:'var(--surface)'}}>
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={()=>setShowImport(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-all" style={{borderColor:'var(--border)',color:'var(--text-muted)',background:'var(--surface)'}}>
            <Upload className="w-4 h-4" /> Import
          </button>
          <button onClick={()=>{setEditOrder(null);setShowForm(true)}} className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-600 transition-all">
            <Plus className="w-4 h-4" /> Add order
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          {label:'Pending',   value:totalPending,  color:'text-amber-700',bg:'bg-amber-50', icon:<Clock className="w-4 h-4 text-amber-500"/>},
          {label:'Received',  value:totalReceived, color:'text-green-700',bg:'bg-green-50', icon:<CheckCircle2 className="w-4 h-4 text-green-500"/>},
          {label:'This month',value:thisMonth,     color:'text-blue-700', bg:'bg-blue-50',  icon:<TrendingUp className="w-4 h-4 text-blue-500"/>},
        ].map(c=>(
          <div key={c.label} className={`${c.bg} rounded-2xl p-3 sm:p-3.5 min-w-0`}>
            <div className={`flex items-center gap-1.5 mb-1 ${c.color}`}>{c.icon}<p className="text-[10px] font-semibold uppercase tracking-wide truncate">{c.label}</p></div>
            <p className={`text-sm sm:text-base font-bold ${c.color} break-words`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {(['all','active','backlog','current','shipped','received','cancelled'] as const).map(f=>{
          const count = f==='all' ? allRows.length
            : f==='active' ? allRows.filter(r=>r.order_status!=='received').length
            : allRows.filter(r=>r.order_status===f).length
          return (
            <button key={f} onClick={()=>setStatFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${statFilter===f?'bg-brand-500 text-white border-transparent':''}`}
              style={statFilter!==f?{borderColor:'var(--border)',background:'var(--surface)',color:'var(--text-muted)'}:{}}>
              {f==='all'?'All':f==='active'?'Active':ORDER_STATUS_LABELS[f as OrderStatus] ?? f}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          )
        })}
        <select value={custFilter} onChange={e=>setCustFilter(e.target.value)} className="px-3 py-1.5 rounded-xl text-xs font-medium border" style={{borderColor:'var(--border)',background:'var(--surface)',color:'var(--text)'}}>
          <option value="all">All customers</option>
          {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center flex-wrap gap-2 mb-3 px-4 py-2.5 rounded-xl border" style={{background:'var(--brand-light)',borderColor:'var(--brand)'}}>
          <span className="text-xs font-medium flex-1" style={{color:'var(--brand)'}}>
            {selected.size} selected · {formatCurrency(selectedRows.reduce((s,r)=>s+r.commission_inr,0))}
          </span>
          <select
            value=""
            onChange={e=>{ if(e.target.value) handleBulkStatus(e.target.value as OrderStatus) }}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold border outline-none cursor-pointer"
            style={{borderColor:'var(--brand)',color:'var(--brand)',background:'var(--surface)'}}
          >
            <option value="">Set status…</option>
            {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(s=>(
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
          {selectedRows.some(r=>r.order_status==='shipped') && (
            <button onClick={()=>setShowRecv(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white">
              <CheckCircle2 className="w-3 h-3"/> Mark received
            </button>
          )}
          <button onClick={handleBulkDelete} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white">
            <Trash2 className="w-3 h-3"/> Delete
          </button>
          <button onClick={()=>setSelected(new Set())} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{color:'var(--brand)'}}>
            <X className="w-4 h-4"/>
          </button>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'var(--surface-2)'}}>
            <TrendingUp className="w-7 h-7" style={{color:'var(--text-muted)'}}/>
          </div>
          <p className="font-medium" style={{color:'var(--text-muted)'}}>No styles yet</p>
          <p className="text-sm mt-1" style={{color:'var(--text-faint)'}}>Add an order or import from CSV</p>
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {sorted.map(row=>{
            const isSel=selected.has(row.id)
            const isRecv=row.order_status==='received'
            const isCancelled=row.order_status==='cancelled'
            const isForeign=row.order.currency!=='INR'
            return (
              <div key={row.id} className="rounded-2xl border p-3.5"
                   style={{borderColor:isSel?'var(--brand)':'var(--border)',background:isSel?'var(--brand-light)':'var(--surface)',opacity:isCancelled?0.5:1}}>
                <div className="flex items-start gap-2.5">
                  <button onClick={()=>toggleRow(row.id)} className="mt-0.5 shrink-0" style={{color:isSel?'var(--brand)':'var(--text-faint)'}}>
                    {isSel?<CheckSquare className="w-5 h-5"/>:<Square className="w-5 h-5"/>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono font-semibold truncate" style={{color:'var(--text)'}}>{row.style_ref??'—'}</span>
                      <span className="text-sm font-semibold shrink-0" style={{color:isCancelled?'var(--text-muted)':'var(--text)'}}>{formatCurrency(row.commission_inr)}</span>
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{color:'var(--text-muted)'}}>
                      {row.customerName}{row.clientName?` · ${row.clientName}`:''}
                    </p>
                    <p className="text-xs mt-0.5" style={{color:'var(--text-muted)'}}>
                      PO{' '}
                      <button onClick={()=>{setEditOrder(row.order);setShowForm(true)}} className="font-mono underline" style={{color:'var(--brand)'}}>
                        {row.poNumber??'—'}
                      </button>
                      {' '}· {(row.quantity??0).toLocaleString()} pcs
                      {row.etd?` · ETD ${formatDate(row.etd)}`:''}
                    </p>
                    {isForeign && (
                      <p className="text-[10px] mt-0.5" style={{color:'var(--text-muted)'}}>{fmtForeign(row.commission_amount,row.order.currency)}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {isRecv
                        ? <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">Received</span>
                        : <select value={row.order_status} onChange={e=>handleStatusChange(row,e.target.value as OrderStatus)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none ${STATUS_PILL[row.order_status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(s=><option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>)}
                          </select>
                      }
                      {isRecv&&<button onClick={()=>handleUnreceive(row)} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg" style={{color:'var(--text-muted)',background:'var(--surface-2)'}}><RotateCcw className="w-3 h-3"/> Undo</button>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block rounded-2xl border overflow-hidden" style={{borderColor:'var(--border)'}}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{background:'var(--surface)'}}>
              <thead style={{background:'var(--surface-2)',borderBottom:'0.5px solid var(--border)'}}>
                <tr>
                  <th className="px-3 py-2 w-8">
                    <button onClick={toggleAll} style={{color:allSel?'var(--brand)':'var(--text-faint)'}}>
                      {allSel?<CheckSquare className="w-4 h-4"/>:<Square className="w-4 h-4"/>}
                    </button>
                  </th>
                  <SortTh label="Style"      col="style_ref"      current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <SortTh label="PO"         col="po_number"      current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <SortTh label="Customer"   col="customer"       current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{color:'var(--text-muted)'}}>Client</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{color:'var(--text-muted)'}}>Qty</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{color:'var(--text-muted)'}}>Rate</th>
                  <SortTh label="Commission" col="commission_inr" current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <SortTh label="ETD"        col="etd"            current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <SortTh label="Status"     col="order_status"   current={sortKey} dir={sortDir} onSort={toggleSort}/>
                  <th className="px-3 py-2 w-8"/>
                </tr>
              </thead>
              <tbody>
                {sorted.map(row=>{
                  const isSel=selected.has(row.id)
                  const isRecv=row.order_status==='received'
                  const isCancelled=row.order_status==='cancelled'
                  const isForeign=row.order.currency!=='INR'
                  return (
                    <tr key={row.id} className="border-t transition-colors" style={{borderColor:'var(--border)',background:isSel?'var(--brand-light)':'var(--surface)',opacity:isCancelled?0.5:1}}>
                      <td className="px-3 py-2.5">
                        <button onClick={()=>toggleRow(row.id)} style={{color:isSel?'var(--brand)':'var(--text-faint)'}}>
                          {isSel?<CheckSquare className="w-4 h-4"/>:<Square className="w-4 h-4"/>}
                        </button>
                      </td>
                      <td className="px-3 py-2.5"><span className="text-sm font-mono" style={{color:'var(--text)'}}>{row.style_ref??'—'}</span></td>
                      <td className="px-3 py-2.5">
                        <button onClick={()=>{setEditOrder(row.order);setShowForm(true)}} className="text-xs font-mono hover:underline" style={{color:'var(--brand)'}}>
                          {row.poNumber??'—'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5"><span className="text-xs" style={{color:'var(--text)'}}>{row.customerName}</span></td>
                      <td className="px-3 py-2.5"><span className="text-xs" style={{color:'var(--text-muted)'}}>{row.clientName??'—'}</span></td>
                      <td className="px-3 py-2.5 text-right"><span className="text-xs" style={{color:'var(--text)'}}>{(row.quantity ?? 0).toLocaleString()}</span></td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs" style={{color:'var(--text)'}}>
                          {isForeign?fmtForeign(row.rate_per_piece,row.order.currency):formatCurrency(row.rate_per_piece)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold" style={{color:isCancelled?'var(--text-muted)':'var(--text)'}}>{formatCurrency(row.commission_inr)}</span>
                        {isForeign&&<div className="text-[10px]" style={{color:'var(--text-muted)'}}>{fmtForeign(row.commission_amount,row.order.currency)}</div>}
                      </td>
                      <td className="px-3 py-2.5"><span className="text-xs" style={{color:row.etd?'var(--text)':'var(--text-faint)'}}>{row.etd?formatDate(row.etd):'—'}</span></td>
                      <td className="px-3 py-2.5">
                        {isRecv
                          ? <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">Received</span>
                          : <select value={row.order_status} onChange={e=>handleStatusChange(row,e.target.value as OrderStatus)}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_PILL[row.order_status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {(['backlog','current','shipped','cancelled'] as OrderStatus[]).map(s=><option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>)}
                            </select>
                        }
                      </td>
                      <td className="px-3 py-2.5">
                        {isRecv&&<button onClick={()=>handleUnreceive(row)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{color:'var(--text-muted)'}} title="Undo"><RotateCcw className="w-3.5 h-3.5"/></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {showForm && <CommissionForm order={editOrder} customers={customers} accounts={accounts} onSaved={handleOrderSaved} onClose={()=>{setShowForm(false);setEditOrder(null)}}/>}
      {showImport && <CommissionImport customers={customers} accounts={accounts} onImported={handleImported} onClose={()=>setShowImport(false)}/>}
      {showRecv && selectedRows.length > 0 && <BulkReceiveModal rows={selectedRows} accounts={accounts} onDone={handleBulkReceiveDone} onClose={()=>setShowRecv(false)}/>}
    </div>
  )
}
