'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Download, CheckSquare, Square, Filter, ChevronDown,
  Paperclip, CheckCircle2, Circle, AlertCircle, FileText, X,
  Plus, Tag, LayoutList, ArrowDownUp, ReceiptText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Types ─────────────────────────────────────────────────────────────────────
interface AttachmentRaw {
  id: string; file_name: string; file_path: string
  content_type: string | null; file_size: number | null
}

interface BillingCategory { id: string; name: string }

interface TxRaw {
  id: string; name: string | null; amount: number; date: string
  type: string; notes: string | null; is_contrast_billed: boolean
  contrast_billing_category_id: string | null; contrast_invoice_id: string | null
  created_at: string
  account: { id: string; name: string; color: string; type: string } | null
  category: { id: string; name: string; icon: string; color: string } | null
  billing_category: BillingCategory | null
  attachments: AttachmentRaw[]
}

type GroupMode = 'month' | 'billing_category' | 'status'
type BilledFilter = 'all' | 'billed' | 'queued' | 'unbilled'

interface Props {
  transactions: TxRaw[]
  billingCategories: BillingCategory[]
  payeeFound: boolean
  payeeName: string
  migrationsRun?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`
}
function monthKey(d: string) { return d.slice(0, 7) }
function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

// ── Billing Category Dropdown ─────────────────────────────────────────────────
function BillingCategoryCell({
  value, categories, onSelect, onCreateAndSelect,
}: {
  value: BillingCategory | null
  categories: BillingCategory[]
  onSelect: (cat: BillingCategory | null) => void
  onCreateAndSelect: (name: string) => Promise<BillingCategory>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  const canCreate = search.trim() && !categories.some(c => c.name.toLowerCase() === search.trim().toLowerCase())

  const handleCreate = async () => {
    if (!search.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const cat = await onCreateAndSelect(search.trim())
      if (!cat?.id) throw new Error('Category creation failed — run migration v19 in Supabase first.')
      onSelect(cat)
      setSearch('')
      setOpen(false)
    } catch (e) {
      setCreateError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all max-w-[140px] ${
          value
            ? 'bg-[var(--surface-2)] text-[#7C3AED] hover:bg-[var(--surface-2)]'
            : 'bg-[var(--surface-2)] text-[var(--text-faint)] hover:bg-[var(--border)]'
        }`}
      >
        <Tag className="w-3 h-3 shrink-0" />
        <span className="truncate">{value?.name ?? 'Add category'}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-1">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search or create…"
              className="w-full text-xs px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate() }}
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {value && (
              <button
                onClick={() => { onSelect(null); setOpen(false) }}
                className="w-full px-3 py-2 text-xs text-left text-[var(--expense)] hover:bg-[var(--surface-2)]"
              >
                Remove category
              </button>
            )}
            {filtered.map(cat => (
              <button
                key={cat.id}
                onClick={() => { onSelect(cat); setOpen(false); setSearch('') }}
                className={`w-full px-3 py-2 text-xs text-left hover:bg-[var(--surface-2)] ${
                  value?.id === cat.id ? 'font-semibold text-[#7C3AED]' : 'text-[var(--text)]'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {canCreate && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full px-3 py-2 text-xs text-left text-[var(--brand)] hover:bg-[var(--brand-light)] flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                {creating ? 'Creating…' : `Create "${search.trim()}"`}
              </button>
            )}
            {createError && (
              <p className="px-3 py-2 text-xs text-[var(--expense)] bg-[var(--surface-2)] border-t border-[var(--border)]">{createError}</p>
            )}
            {filtered.length === 0 && !canCreate && !createError && (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)]">No categories found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReimbursableExpensesClient({
  transactions: initialTx, billingCategories: initialCats,
  payeeFound, payeeName, migrationsRun = true,
}: Props) {
  const [transactions, setTransactions] = useState<TxRaw[]>(initialTx)
  const [categories, setCategories] = useState<BillingCategory[]>(initialCats)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<BilledFilter>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('month')

  const months = useMemo(() => {
    const keys = new Set(transactions.map(t => monthKey(t.date)))
    return Array.from(keys).sort().reverse()
  }, [transactions])

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const monthOk = selectedMonth === 'all' || monthKey(t.date) === selectedMonth
      const isQueued  = !t.is_contrast_billed && !!t.contrast_billing_category_id
      const isUnqueued = !t.is_contrast_billed && !t.contrast_billing_category_id
      const billedOk =
        filter === 'all'     ? true :
        filter === 'billed'  ? t.is_contrast_billed :
        filter === 'queued'  ? isQueued :
        /* unbilled */         isUnqueued
      return monthOk && billedOk
    })
  }, [transactions, selectedMonth, filter])

  const totalAmount   = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered])
  const billedAmount  = useMemo(() => filtered.filter(t => t.is_contrast_billed).reduce((s, t) => s + t.amount, 0), [filtered])
  const queuedAmount  = useMemo(() => filtered.filter(t => !t.is_contrast_billed && !!t.contrast_billing_category_id).reduce((s, t) => s + t.amount, 0), [filtered])

  const selectedAttachmentCount = useMemo(() =>
    filtered.filter(t => selectedIds.has(t.id)).reduce((s, t) => s + t.attachments.length, 0)
  , [filtered, selectedIds])

  // ── Grouping ───────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: TxRaw[] }>()
    for (const t of filtered) {
      let key = ''
      let label = ''
      if (groupMode === 'month') {
        key = monthKey(t.date); label = monthLabel(key)
      } else if (groupMode === 'billing_category') {
        key = t.contrast_billing_category_id ?? '__none__'
        label = t.billing_category?.name ?? 'No Billing Category'
      } else {
        key = t.is_contrast_billed ? 'billed' : 'unbilled'
        label = t.is_contrast_billed ? 'Billed' : 'Unbilled'
      }
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(t)
    }
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }))
  }, [filtered, groupMode])

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))
  const someSelected = selectedIds.size > 0
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(t => t.id)))
  const toggleOne = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Billing category actions ───────────────────────────────────────────────
  const createAndSelectCategory = async (name: string): Promise<BillingCategory> => {
    const res = await fetch('/api/contrast/billing-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error ?? `Server error ${res.status}. Have you run migration v19 in Supabase?`)
    }
    const cat = json as BillingCategory
    setCategories(prev => [...prev.filter(c => c.id !== cat.id), cat].sort((a, b) => a.name.localeCompare(b.name)))
    return cat
  }

  const assignBillingCategory = async (txId: string, cat: BillingCategory | null) => {
    await fetch('/api/transactions/contrast-billed', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [txId], billed: transactions.find(t => t.id === txId)?.is_contrast_billed ?? false, billing_category_id: cat?.id ?? null }),
    })
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, contrast_billing_category_id: cat?.id ?? null, billing_category: cat } : t))
  }

  // ── Mark billed / unbilled ─────────────────────────────────────────────────
  const markBilled = async (ids: string[], billed: boolean) => {
    setTogglingIds(new Set(ids))
    try {
      const res = await fetch('/api/transactions/contrast-billed', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, billed }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setTransactions(prev => prev.map(t => ids.includes(t.id) ? { ...t, is_contrast_billed: billed } : t))
      setSelectedIds(new Set())
    } catch (e) {
      notify('Could not update: ' + (e as Error).message)
    } finally {
      setTogglingIds(new Set())
    }
  }

  // ── Bulk attachment download ───────────────────────────────────────────────
  const downloadSelected = async () => {
    const txsWithAttachments = filtered.filter(t => selectedIds.has(t.id) && t.attachments.length > 0)
    if (txsWithAttachments.length === 0) { notify('No attachments in selection.'); return }
    setDownloading(true)
    const supabase = createClient()
    try {
      for (const tx of txsWithAttachments) {
        for (const att of tx.attachments) {
          const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(att.file_path, 3600)
          if (!data?.signedUrl) continue
          await new Promise<void>(resolve => setTimeout(async () => {
            try {
              const blob = await (await fetch(data.signedUrl)).blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `${tx.date}_${att.file_name}`
              document.body.appendChild(a); a.click()
              document.body.removeChild(a); URL.revokeObjectURL(url)
            } catch { window.open(data.signedUrl, '_blank') }
            resolve()
          }, 300))
        }
      }
    } catch (e) { notify('Download failed: ' + (e as Error).message) }
    finally { setDownloading(false) }
  }

  // ── No payee found ─────────────────────────────────────────────────────────
  if (!payeeFound) {
    return (
      <div className="p-6 w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#7C3AED]" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Contrast Expenses</h1>
        </div>
        <div className="bg-[var(--accent-light)] border border-[var(--border)] rounded-2xl p-6 flex gap-4">
          <AlertCircle className="w-5 h-5 text-[var(--amber)] mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-[var(--amber)]">No "Contrast" payee found</p>
            <p className="text-sm text-[var(--amber)] mt-1">
              Create a payee named <strong>Contrast</strong> and link it to transactions to see them here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 w-full space-y-5">

      {/* Migration warning */}
      {!migrationsRun && (
        <div className="bg-[var(--accent-light)] border border-[var(--border)] rounded-2xl px-4 py-3 flex gap-3">
          <AlertCircle className="w-4 h-4 text-[var(--amber)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--amber)]">
            <strong>Run migrations v18 &amp; v19</strong> in Supabase to enable Billing Categories and Invoice tracking.
            Transactions are shown in read-only mode until then.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#7C3AED]" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Contrast Expenses</h1>
            <p className="text-sm text-[var(--text-muted)]">{filtered.length} transactions · payee: {payeeName}</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-[var(--text-muted)] mb-1">Total</p>
          <p className="text-lg font-bold text-[var(--text)]">{fmtCurrency(totalAmount)}</p>
        </div>
        <div className="bg-[var(--brand-light)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-[var(--brand)] mb-1 flex items-center gap-1">
            <ReceiptText className="w-3 h-3" /> Queued for Invoice
          </p>
          <p className="text-lg font-bold text-[var(--brand)]">{fmtCurrency(queuedAmount)}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-[var(--text-muted)] mb-1">Billed</p>
          <p className="text-lg font-bold text-[var(--income)]">{fmtCurrency(billedAmount)}</p>
        </div>
      </div>

      {/* Filters + grouping */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Month picker */}
        <div className="relative">
          <button
            onClick={() => setShowMonthPicker(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            <Filter className="w-4 h-4 text-[var(--text-faint)]" />
            {selectedMonth === 'all' ? 'All months' : monthLabel(selectedMonth)}
            <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />
          </button>
          {showMonthPicker && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-20 min-w-[160px] py-1">
              <button onClick={() => { setSelectedMonth('all'); setShowMonthPicker(false) }}
                className={`w-full px-4 py-2 text-sm text-left hover:bg-[var(--surface-2)] ${selectedMonth === 'all' ? 'font-semibold text-[#7C3AED]' : 'text-[var(--text)]'}`}>
                All months
              </button>
              {months.map(m => (
                <button key={m} onClick={() => { setSelectedMonth(m); setShowMonthPicker(false) }}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-[var(--surface-2)] ${selectedMonth === m ? 'font-semibold text-[#7C3AED]' : 'text-[var(--text)]'}`}>
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Billed filter */}
        <div className="flex bg-[var(--surface-2)] rounded-xl p-1 gap-1">
          {([
            ['all',     'All'],
            ['queued',  'Queued'],
            ['billed',  'Billed'],
            ['unbilled','Not queued'],
          ] as [BilledFilter, string][]).map(([f, lbl]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? f === 'queued' ? 'bg-[var(--brand)] text-white shadow-sm' : 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Group by */}
        <div className="flex items-center gap-1.5 bg-[var(--surface-2)] rounded-xl p-1">
          <LayoutList className="w-3.5 h-3.5 text-[var(--text-faint)] ml-1" />
          {([['month', 'Month'], ['billing_category', 'Category'], ['status', 'Status']] as [GroupMode, string][]).map(([g, lbl]) => (
            <button key={g} onClick={() => setGroupMode(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${groupMode === g ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Bulk actions */}
        {someSelected && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)]">{selectedIds.size} selected</span>
            <button onClick={downloadSelected} disabled={downloading || selectedAttachmentCount === 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${selectedAttachmentCount === 0 ? 'bg-[var(--surface-2)] text-[var(--text-faint)] cursor-not-allowed' : 'bg-[var(--surface-2)] text-[var(--transfer)] hover:bg-[var(--surface-2)]'}`}>
              {downloading ? <span className="w-3.5 h-3.5 border border-[var(--transfer)] border-t-transparent rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {downloading ? 'Downloading…' : `Download (${selectedAttachmentCount})`}
            </button>
            <button onClick={() => markBilled(Array.from(selectedIds), true)} disabled={togglingIds.size > 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand-light)] text-[var(--income)] hover:bg-[var(--brand-light)] rounded-xl text-xs font-medium disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark billed
            </button>
            <button onClick={() => markBilled(Array.from(selectedIds), false)} disabled={togglingIds.size > 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent-light)] text-[var(--amber)] hover:bg-[var(--accent-light)] rounded-xl text-xs font-medium disabled:opacity-50">
              <Circle className="w-3.5 h-3.5" /> Mark unbilled
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Grouped table */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-16 text-center text-[var(--text-faint)]">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const groupTotal = group.items.reduce((s, t) => s + t.amount, 0)
            return (
              <div key={group.key} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      const groupIds = group.items.map(t => t.id)
                      const allGroupSelected = groupIds.every(id => selectedIds.has(id))
                      setSelectedIds(prev => {
                        const n = new Set(prev)
                        allGroupSelected ? groupIds.forEach(id => n.delete(id)) : groupIds.forEach(id => n.add(id))
                        return n
                      })
                    }} className="text-[var(--text-faint)] hover:text-[var(--text-muted)]">
                      {group.items.every(t => selectedIds.has(t.id))
                        ? <CheckSquare className="w-4 h-4 text-[#7C3AED]" />
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                    <span className="text-sm font-semibold text-[var(--text)]">{group.label}</span>
                    <span className="text-xs text-[var(--text-faint)]">({group.items.length})</span>
                  </div>
                  <span className="text-sm font-bold text-[var(--text)]">{fmtCurrency(groupTotal)}</span>
                </div>

                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 bg-[var(--surface-2)]/50 border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)]">
                  <div className="w-4" />
                  <span className="flex-1">Transaction</span>
                  <span className="w-28 hidden md:block">Tx Category</span>
                  <span className="w-36 hidden lg:block">Billing Category</span>
                  <span className="w-24 text-right hidden sm:block">Amount</span>
                  <span className="w-24 hidden md:block text-center">Attachments</span>
                  <span className="w-20 text-center">Status</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-[var(--border-2)]">
                  {group.items.map(tx => {
                    const isSelected = selectedIds.has(tx.id)
                    const isToggling = togglingIds.has(tx.id)
                    return (
                      <div key={tx.id} className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] transition-colors ${isSelected ? 'bg-[var(--surface-2)]/50' : ''}`}>
                        {/* Checkbox */}
                        <button onClick={() => toggleOne(tx.id)} className="shrink-0 text-[var(--text-faint)] hover:text-[#7C3AED]">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-[#7C3AED]" /> : <Square className="w-4 h-4" />}
                        </button>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">
                            {tx.name ?? tx.category?.name ?? 'Expense'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[var(--text-faint)]">{fmtDate(tx.date)}</span>
                            {tx.account && (
                              <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                style={{ backgroundColor: `${tx.account.color}18`, color: tx.account.color }}>
                                {tx.account.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tx Category (read-only) */}
                        <div className="w-28 hidden md:block shrink-0">
                          {tx.category ? (
                            <span className="text-xs px-2 py-1 rounded-lg font-medium"
                              style={{ backgroundColor: `${tx.category.color}18`, color: tx.category.color }}>
                              {tx.category.name}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-faint)]">—</span>
                          )}
                        </div>

                        {/* Billing Category (editable dropdown) */}
                        <div className="w-36 hidden lg:block shrink-0">
                          <BillingCategoryCell
                            value={tx.billing_category}
                            categories={categories}
                            onSelect={(cat) => assignBillingCategory(tx.id, cat)}
                            onCreateAndSelect={async (name) => {
                              const cat = await createAndSelectCategory(name)
                              await assignBillingCategory(tx.id, cat)
                              return cat
                            }}
                          />
                        </div>

                        {/* Amount */}
                        <div className="w-24 text-right hidden sm:block shrink-0">
                          <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-[var(--income)]' : 'text-[var(--text)]'}`}>
                            {tx.type === 'income' ? '+' : '-'}{fmtCurrency(tx.amount)}
                          </span>
                        </div>

                        {/* Attachments */}
                        <div className="w-24 hidden md:flex items-center justify-center shrink-0">
                          {tx.attachments.length > 0 ? (
                            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] bg-[var(--surface-2)] px-2 py-1 rounded-lg">
                              <Paperclip className="w-3 h-3" />
                              {tx.attachments.length}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-faint)]">—</span>
                          )}
                        </div>

                        {/* Status badge — 3 states: Billed / Queued / Not queued */}
                        <div className="w-24 flex justify-center shrink-0">
                          {(() => {
                            const isQueued = !tx.is_contrast_billed && !!tx.contrast_billing_category_id
                            const btnBase = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all'
                            const btnColor = tx.is_contrast_billed
                              ? 'bg-[var(--brand-light)] text-[var(--income)] '
                              : isQueued
                                ? 'bg-[var(--brand-light)] text-[var(--brand)] hover:bg-[var(--brand)]'
                                : 'bg-[var(--accent-light)] text-[var(--amber)] hover:bg-[var(--accent-light)]'
                            const icon = isToggling
                              ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              : tx.is_contrast_billed
                                ? <CheckCircle2 className="w-3 h-3" />
                                : isQueued
                                  ? <ReceiptText className="w-3 h-3" />
                                  : <Circle className="w-3 h-3" />
                            const label = tx.is_contrast_billed ? 'Billed' : isQueued ? 'Queued' : 'Not queued'
                            return (
                              <button
                                onClick={() => markBilled([tx.id], !tx.is_contrast_billed)}
                                disabled={isToggling}
                                title={isQueued ? 'Will be included in next invoice — click to mark billed manually' : undefined}
                                className={`${btnBase} ${btnColor} ${isToggling ? 'opacity-50' : ''}`}
                              >
                                {icon}
                                {label}
                              </button>
                            )
                          })()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand footer */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm">
          <span className="text-xs text-[var(--text-muted)]">
            {filtered.length} transactions · {filtered.reduce((s, t) => s + t.attachments.length, 0)} attachments
          </span>
          <span className="text-sm font-bold text-[var(--text)]">{fmtCurrency(totalAmount)}</span>
        </div>
      )}
    </div>
  )
}
