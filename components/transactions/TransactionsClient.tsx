'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, ArrowLeftRight, Filter, X, CheckSquare, Square, Trash2, Download, FileText, ExternalLink, Pencil, Paperclip, Gem, Hammer } from 'lucide-react'
import MarkAsAssetModal from './MarkAsAssetModal'
import AddToAssetModal from './AddToAssetModal'
import type { Transaction, Account, Category, Payee } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency, getRelativeDate, accountGroupRank } from '@/lib/utils'
import TransactionItem from './TransactionItem'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'

const TransactionForm = dynamic(() => import('./TransactionForm'), { ssr: false })

interface Props {
  initialTransactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  payees: Pick<Payee, 'id' | 'name'>[]
  companies?: { id: string; name: string }[]
  totalCredits: number
  totalDebits: number
  hideHeader?: boolean
}

type FilterType = 'all' | 'expense' | 'income' | 'transfer'

const DELETED_KEY = 'inex-deleted-tx-ids'

function getDeletedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DELETED_KEY) || '[]') } catch { return [] }
}
function addDeletedId(id: string) {
  try {
    const ids = getDeletedIds()
    if (!ids.includes(id)) sessionStorage.setItem(DELETED_KEY, JSON.stringify([...ids, id]))
  } catch {}
}

export default function TransactionsClient({ initialTransactions, accounts, categories, payees, companies = [], totalCredits, totalDebits, hideHeader = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const deleted = getDeletedIds()
    return deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
  })
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [accountFilter, setAccountFilter] = useState(() => searchParams.get('account') ?? 'all')
  // Advanced filters — pre-fill from URL so deep-links (e.g. from the dashboard
  // ring chart) land with the filter already applied.
  const initPayee    = searchParams.get('payee')    ?? ''
  const initCategory = searchParams.get('category') ?? ''
  const initUsedFor  = searchParams.get('usedFor')  ?? ''
  const initFrom     = searchParams.get('from')     ?? ''
  const initTo       = searchParams.get('to')       ?? ''
  const [showFilters, setShowFilters] = useState(
    !!(initPayee || initCategory || initUsedFor || initFrom || initTo)
  )
  const [filterPayee, setFilterPayee]     = useState<string>(initPayee)
  const [filterCategory, setFilterCategory] = useState<string>(initCategory)
  const [filterUsedFor, setFilterUsedFor]   = useState<string>(initUsedFor)
  const [dateFrom, setDateFrom] = useState<string>(initFrom)
  const [dateTo, setDateTo]     = useState<string>(initTo)
  // Multi-select
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const deleted = getDeletedIds()
    setTransactions(
      deleted.length ? initialTransactions.filter(t => !deleted.includes(t.id)) : initialTransactions
    )
  }, [initialTransactions])

  // ── Additive "Load older" pagination ──────────────────────────────────────
  // The page loads the newest 1,000 rows. This appends older batches on demand
  // (dedup by id) without changing the initial load or client-side search.
  const PAGE = 1000
  const [serverLoaded, setServerLoaded] = useState(initialTransactions.length)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(initialTransactions.length < PAGE)
  useEffect(() => { setServerLoaded(initialTransactions.length); setReachedEnd(initialTransactions.length < PAGE) }, [initialTransactions])

  const loadOlder = useCallback(async () => {
    setLoadingMore(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const SEL = `*, account:accounts!account_id(id,name,color,type,custom_type_id), to_account:accounts!to_account_id(id,name,color), category:categories(id,name,icon,color,type,avatar_url), payee:payees(id,name), attachments(*)`
      const { data } = await supabase
        .from('transactions').select(SEL)
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(serverLoaded, serverLoaded + PAGE - 1)
      const rows = (data ?? []) as unknown as Transaction[]
      setServerLoaded(c => c + rows.length)
      if (rows.length < PAGE) setReachedEnd(true)
      if (rows.length) {
        setTransactions(prev => {
          const ids = new Set(prev.map(t => t.id))
          return [...prev, ...rows.filter(r => !ids.has(r.id))]
        })
      }
    } finally {
      setLoadingMore(false)
    }
  }, [serverLoaded])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filter !== 'all' && tx.type !== filter) return false
      if (accountFilter !== 'all' && tx.account_id !== accountFilter && tx.to_account_id !== accountFilter) return false
      // 'none' is a sentinel meaning "transactions without any payee" — used
      // by the dashboard's "No payee" ring drill-down so the user can triage.
      if (filterPayee === 'none') { if (tx.payee_id != null) return false }
      else if (filterPayee && tx.payee_id !== filterPayee) return false
      if (filterCategory && tx.category_id !== filterCategory) return false
      // 'personal' sentinel matches no company set (i.e. NULL = personal).
      if (filterUsedFor === 'personal') { if (tx.used_for_company_id != null) return false }
      else if (filterUsedFor && tx.used_for_company_id !== filterUsedFor) return false
      if (dateFrom && tx.date < dateFrom) return false
      if (dateTo && tx.date > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        const matchName = tx.name?.toLowerCase().includes(q)
        const matchNotes = tx.notes?.toLowerCase().includes(q)
        const matchCategory = (tx.category as Category | undefined)?.name?.toLowerCase().includes(q)
        const matchAccount = (tx.account as Account | undefined)?.name?.toLowerCase().includes(q)
        const matchPayee = (tx.payee as Payee | undefined)?.name?.toLowerCase().includes(q)
        if (!matchName && !matchNotes && !matchCategory && !matchAccount && !matchPayee) return false
      }
      return true
    })
  }, [transactions, filter, accountFilter, filterPayee, filterCategory, filterUsedFor, dateFrom, dateTo, search])

  const hasAdvFilters = !!(filterPayee || filterCategory || filterUsedFor || dateFrom || dateTo)
  const clearAdvFilters = () => {
    setFilterPayee(''); setFilterCategory(''); setFilterUsedFor(''); setDateFrom(''); setDateTo('')
  }

  // Selection helpers
  const toggleSelected = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAllVisible = useCallback(() => {
    setSelected(prev => {
      const all = filtered.map(t => t.id)
      const allSelected = all.length > 0 && all.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        for (const id of all) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of all) next.add(id)
      return next
    })
  }, [filtered])
  const clearSelection = () => setSelected(new Set())

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!await confirmDialog({
      title: `Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?`,
      message: 'This cannot be undone. Linked drafts will be unlinked.',
      confirmLabel: 'Delete all',
    })) return
    setDeleting(true)
    const ids = Array.from(selected)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired', 'error'); return }
      const { error } = await supabase.from('transactions').delete().in('id', ids).eq('user_id', user.id)
      if (error) {
        notify(error.message, 'error')
        return
      }
      // Optimistically remove and persist to the deleted-ids guard
      ids.forEach(addDeletedId)
      setTransactions(prev => prev.filter(t => !selected.has(t.id)))
      setSelected(new Set())
      setSelectMode(false)
      notify(`${ids.length} transaction${ids.length === 1 ? '' : 's'} deleted`, 'success')
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    filtered.forEach(tx => {
      const key = tx.date
      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const handleSaved = useCallback((tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id)
      if (exists) return prev.map(t => t.id === tx.id ? tx : t)
      return [tx, ...prev]
    })
    setShowForm(false)
    setEditTx(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    addDeletedId(id)
    setTransactions(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }, [router])

  const handleEdit = useCallback((tx: Transaction) => {
    setEditTx(tx)
    setShowForm(true)
  }, [])

  // Selected transaction → right-side sliding panel (like Assets)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  // Expenses that already became assets: transaction id → asset name. Loaded
  // once, so a linked expense says what it bought instead of offering to
  // create a second asset against the same payment.
  const [assetTx, setAssetTx] = useState<Transaction | null>(null)
  const [improveTx, setImproveTx] = useState<Transaction | null>(null)
  const [assetByTxn, setAssetByTxn] = useState<Record<string, string>>({})
  useEffect(() => {
    const sb = createClient()
    sb.from('assets').select('name, purchase_transaction_id').not('purchase_transaction_id', 'is', null)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        for (const a of (data ?? []) as { name: string; purchase_transaction_id: string }[]) {
          map[a.purchase_transaction_id] = a.name
        }
        setAssetByTxn(map)
      })
  }, [])
  useEffect(() => {
    if (!selectedTx) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTx(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedTx])

  // Compact ₹ formatter for the stat strip (₹1.42Cr / ₹98.6L / ₹4.5K)
  const fmtCompact = useCallback((n: number) => {
    const abs = Math.abs(n)
    const sign = n < 0 ? '−' : ''
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`
    return `${sign}₹${abs.toFixed(0)}`
  }, [])

  const netPosition = totalCredits - totalDebits
  const { mask } = useBalanceVisibility()

  // This-month net flow + a small cumulative sparkline
  const { monthNet, sparkPoints, monthLabel } = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthTx = transactions
      .filter(t => t.date.startsWith(ym) && t.type !== 'transfer')
      .sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    const cum = monthTx.map(t => { running += t.type === 'income' ? t.amount : -t.amount; return running })
    const net = running
    // sample up to 6 points for the polyline
    const pts: number[] = []
    if (cum.length > 0) {
      const n = Math.min(6, cum.length)
      for (let i = 0; i < n; i++) pts.push(cum[Math.floor((i * (cum.length - 1)) / (n - 1 || 1))])
    }
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts)
    const range = max - min || 1
    const poly = pts.map((v, i) => `${(i / (pts.length - 1 || 1)) * 90},${28 - ((v - min) / range) * 24}`).join(' ')
    return { monthNet: net, sparkPoints: poly, monthLabel: now.toLocaleDateString('en-IN', { month: 'long' }).toUpperCase() }
  }, [transactions])

  // Inline attachment preview shown in the detail rail. Mints a short-lived
  // signed URL (the transactions query doesn't include a ready one).
  const [preview, setPreview] = useState<{ id: string; url: string; name: string; contentType: string | null } | null>(null)
  const openAttachment = async (att: { id: string; file_path: string; file_name: string; content_type: string | null; url?: string }) => {
    let url = att.url
    if (!url) {
      const s = createClient()
      const { data } = await s.storage.from('vaultr-attachments').createSignedUrl(att.file_path, 3600)
      url = data?.signedUrl
    }
    if (url) setPreview({ id: att.id, url, name: att.file_name, contentType: att.content_type })
    else notify('Could not open attachment', 'error')
  }

  // Shared detail-panel content, reused in the desktop rail + mobile sheet
  const renderDetail = (tx: Transaction) => {
    const acct = tx.account as Account | undefined
    const cat = tx.category as Category | undefined
    const income = tx.type === 'income'
    const transfer = tx.type === 'transfer'
    const color = income ? 'var(--income)' : transfer ? 'var(--transfer)' : 'var(--expense)'
    const usedFor = companies.find(c => c.id === tx.used_for_company_id)?.name
    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-extrabold tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>TRANSACTION</p>
          <button onClick={() => setSelectedTx(null)} aria-label="Close" className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="flex flex-col items-center text-center pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
            {transfer ? '↔️' : getCategoryEmoji(cat?.icon)}
          </div>
          <p className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{tx.name || cat?.name || 'Transaction'}</p>
          <p className="text-3xl font-extrabold mt-1.5" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
            {income ? '+' : transfer ? '' : '−'}{formatCurrency(tx.amount)}
          </p>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full mt-2" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
            {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
          </span>
        </div>
        <div className="py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
          {[
            ['Date', new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
            ['Account', acct?.name ?? '—'],
            ['Category', cat ? `${getCategoryEmoji(cat.icon)} ${cat.name}` : '—'],
            ['Payee', (tx.payee as Payee | undefined)?.name ?? '—'],
            ...(usedFor ? [['Used for', usedFor]] : []),
            ...(tx.notes ? [['Notes', tx.notes]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <span className="text-[12.5px] shrink-0" style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span className="text-[12.5px] font-semibold text-right" style={{ color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
        {(tx.attachments?.length ?? 0) > 0 && (
          <div className="py-4 space-y-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>ATTACHMENT{(tx.attachments?.length ?? 0) > 1 ? 'S' : ''}</p>
            {(tx.attachments ?? []).map(a => {
              const open = preview?.id === a.id
              return (
                <button key={a.id} onClick={() => (open ? setPreview(null) : openAttachment(a))} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left" style={{ background: open ? 'var(--brand-light)' : 'var(--surface-2)', border: `1px solid ${open ? 'var(--brand)' : 'var(--border)'}` }}>
                  <FileText className="w-[18px] h-[18px] shrink-0" style={{ color: 'var(--brand)' }} />
                  <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{a.file_name}</span>
                  {open ? <X className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} /> : <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} />}
                </button>
              )
            })}
            {preview && tx.attachments?.some(a => a.id === preview.id) && (
              <div className="rounded-xl overflow-hidden mt-1" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: 'var(--surface-2)' }}>
                  <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{preview.name}</span>
                  <a href={preview.url} target="_blank" rel="noreferrer" title="Open in new tab" className="shrink-0"><ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} /></a>
                </div>
                {(preview.contentType ?? '').startsWith('image/')
                  ? <img src={preview.url} alt={preview.name} className="w-full max-h-[440px] object-contain" style={{ background: 'var(--surface-2)' }} />
                  : <iframe src={preview.url} title={preview.name} className="w-full" style={{ height: '440px', border: 'none', background: 'var(--surface-2)' }} />}
              </div>
            )}
          </div>
        )}
        {/* An expense can BE a purchase: the money left, but the thing it bought
            is still yours and belongs on the balance sheet. */}
        {tx.type === 'expense' && (
          assetByTxn[tx.id] ? (
            <Link
              href="/assets"
              className="w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 mt-4"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <Gem className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
              <div className="min-w-0 text-left">
                <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>{assetByTxn[tx.id]}</p>
                <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>This expense bought an asset you still hold</p>
              </div>
            </Link>
          ) : (
            <div className="space-y-2 mt-4">
              <button
                onClick={() => setAssetTx(tx)}
                className="w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <Gem className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Mark as asset</p>
                  <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>This expense bought something you still own</p>
                </div>
              </button>

              {/* The other half. Cement for a house on land you already own didn't
                  buy a NEW asset — you can't sell the cement — it went INTO one.
                  Without this, that money either becomes a phantom asset or
                  disappears into expenses, and the land's cost is understated by
                  the price of a house. */}
              <button
                onClick={() => setImproveTx(tx)}
                className="w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <Hammer className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Add to an existing asset</p>
                  <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>This went into something you already own — a building, a renovation</p>
                </div>
              </button>
            </div>
          )
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={() => handleEdit(tx)} className="flex-1 flex items-center justify-center gap-1.5 text-white rounded-xl py-2.5 text-[12.5px] font-bold" style={{ background: 'var(--brand)' }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={async () => { if (await confirmDialog('Delete this transaction?')) { const s = createClient(); const { data: { user } } = await s.auth.getUser(); if (user) await s.from('transactions').delete().eq('id', tx.id).eq('user_id', user.id); handleDelete(tx.id); setSelectedTx(null) } }} className="flex items-center justify-center rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface)', color: 'var(--expense)', border: '1px solid var(--border)' }}>
            <Trash2 className="w-[15px] h-[15px]" />
          </button>
        </div>
      </>
    )
  }

  return (
    <div className={hideHeader ? '' : 'w-full px-4 md:px-6 py-6'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {!hideHeader ? (
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Transactions</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{filtered.length.toLocaleString('en-IN')} of {transactions.length.toLocaleString('en-IN')} records</p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{filtered.length} records</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              const rows = [['Date', 'Name', 'Type', 'Amount', 'Account', 'Category'],
                ...filtered.map(t => [t.date, (t.name ?? '').replace(/,/g, ' '), t.type, String(t.amount),
                  (t.account as Account | undefined)?.name ?? '', (t.category as Category | undefined)?.name ?? ''])]
              const csv = rows.map(r => r.join(',')).join('\n')
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click(); URL.revokeObjectURL(url)
            }}
            className="flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => { setEditTx(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all"
            style={{ background: 'var(--brand)', boxShadow: 'var(--shadow)' }}
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Summary strip — all-time totals + this-month net flow */}
      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 mb-4">
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>CREDITS · ALL TIME</p>
          <p className="text-lg font-extrabold tracking-tight mt-1" style={{ color: 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>{mask(fmtCompact(totalCredits))}</p>
        </div>
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>DEBITS · ALL TIME</p>
          <p className="text-lg font-extrabold tracking-tight mt-1" style={{ color: 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{mask(fmtCompact(totalDebits))}</p>
        </div>
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>NET POSITION</p>
          <p className="text-lg font-extrabold tracking-tight mt-1" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{mask(`${netPosition >= 0 ? '+' : ''}${fmtCompact(netPosition)}`)}</p>
        </div>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-2" style={{ background: 'linear-gradient(135deg, var(--brand-deep), var(--brand-dark))' }}>
          <div>
            <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.6)' }}>{monthLabel} NET FLOW</p>
            <p className="text-lg font-extrabold tracking-tight mt-1" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{mask(`${monthNet >= 0 ? '+' : '−'}${fmtCompact(Math.abs(monthNet))}`)}</p>
          </div>
          {sparkPoints && (
            <svg viewBox="0 0 90 34" preserveAspectRatio="none" className="w-[90px] h-[30px] shrink-0">
              <polyline points={sparkPoints} fill="none" stroke="#7FD9A4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Search + Filter + Select */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={() => setShowFilters(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium shrink-0"
          style={{
            background: hasAdvFilters ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
            borderColor: hasAdvFilters ? 'var(--brand)' : 'var(--border)',
            color: hasAdvFilters ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          <Filter className="w-3.5 h-3.5" />
          {hasAdvFilters ? 'Filtered' : 'Filter'}
        </button>
        <button
          onClick={() => { setSelectMode(s => !s); setSelected(new Set()) }}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium shrink-0"
          style={{
            background: selectMode ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
            borderColor: selectMode ? 'var(--brand)' : 'var(--border)',
            color: selectMode ? 'var(--brand)' : 'var(--text-muted)',
          }}
        >
          {selectMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {/* Quick type / account filter row */}
      <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
        {(['all', 'expense', 'income', 'transfer'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border"
            style={filter === f
              ? { background: f === 'expense' ? 'var(--expense)' : f === 'income' ? 'var(--income)' : f === 'transfer' ? '#3B82F6' : 'var(--brand)', borderColor: 'transparent', color: '#fff' }
              : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <option value="all">All Accounts</option>
          {[...accounts].sort((a, b) =>
            (accountGroupRank(a.type, a.custom_type_name) - accountGroupRank(b.type, b.custom_type_name))
            || a.name.localeCompare(b.name)
          ).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="rounded-xl border p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Payee</label>
            <select value={filterPayee} onChange={e => setFilterPayee(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All payees</option>
              <option value="none">— No payee —</option>
              {payees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <option value="">All categories</option>
              {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {companies.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Used for</label>
              <select value={filterUsedFor} onChange={e => setFilterUsedFor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                <option value="">Any</option>
                <option value="personal">— Personal —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          {hasAdvFilters && (
            <div className="sm:col-span-2 flex justify-end">
              <button onClick={clearAdvFilters} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Select-all row + bulk delete bar */}
      {selectMode && (
        <div className="sticky top-3 z-10 mb-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 shadow-sm"
          style={{ background: 'var(--surface)', borderColor: selected.size > 0 ? 'var(--brand)' : 'var(--border)' }}>
          <button onClick={selectAllVisible} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}>
            {selected.size === filtered.length && filtered.length > 0
              ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              : <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            }
            <span>{selected.size === 0 ? `Select all (${filtered.length})` : `${selected.size} selected`}</span>
          </button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={clearSelection} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)', border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)' }}
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body: full-width list (detail slides in from the right, like Assets) */}
      <div>
        <div className="min-w-0">
          {grouped.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
                <ArrowLeftRight className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />
              </div>
              <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No transactions found</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>
                {search || filter !== 'all' ? 'Try changing your filters' : 'Add your first transaction'}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([date, txs]) => {
                const inSum = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
                const outSum = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-xs font-extrabold tracking-[0.04em] uppercase" style={{ color: 'var(--text-muted)' }}>{getRelativeDate(date)}</p>
                      <p className="text-xs font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {inSum > 0 && <span style={{ color: 'var(--income)' }}>+{fmtCompact(inSum)}</span>}
                        {outSum > 0 && <span className="ml-2" style={{ color: 'var(--expense)' }}>−{fmtCompact(outSum)}</span>}
                      </p>
                    </div>
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                      {txs.map((tx, i) => {
                        const income = tx.type === 'income', transfer = tx.type === 'transfer'
                        const color = income ? 'var(--income)' : transfer ? 'var(--transfer)' : 'var(--expense)'
                        const acct = tx.account as Account | undefined
                        const cat = tx.category as Category | undefined
                        const isSel = selectedTx?.id === tx.id
                        const last = i === txs.length - 1
                        if (selectMode) {
                          return (
                            <div key={tx.id} className="flex items-stretch">
                              <button onClick={() => toggleSelected(tx.id)} className="flex items-center justify-center px-3 shrink-0 border-r" style={{ borderColor: 'var(--border)' }} aria-label={selected.has(tx.id) ? 'Deselect' : 'Select'}>
                                {selected.has(tx.id) ? <CheckSquare className="w-5 h-5" style={{ color: 'var(--brand)' }} /> : <Square className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <TransactionItem transaction={tx} isFirst={i === 0} isLast={last} onEdit={handleEdit} onDelete={handleDelete} contextAccountId={accountFilter !== 'all' ? accountFilter : undefined} accounts={accounts} categories={categories} onSplit={handleDelete} />
                              </div>
                            </div>
                          )
                        }
                        return (
                          <button
                            key={tx.id}
                            onClick={() => setSelectedTx(tx)}
                            className="w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors"
                            style={{
                              borderBottom: last ? 'none' : '1px solid var(--border-2)',
                              background: isSel ? 'var(--brand-light)' : 'transparent',
                              borderLeft: `3px solid ${isSel ? 'var(--brand)' : 'transparent'}`,
                            }}
                          >
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[17px] shrink-0" style={{ background: income || transfer ? `color-mix(in srgb, ${color} 16%, transparent)` : 'var(--surface-2)' }}>
                              {transfer ? '↔️' : getCategoryEmoji(cat?.icon)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13.5px] truncate" style={{ color: 'var(--text)', fontWeight: isSel ? 700 : 600 }}>{tx.name || cat?.name || (transfer ? 'Transfer' : 'Uncategorised')}</p>
                              <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>
                                {transfer ? `${acct?.name ?? ''} → ${(tx.to_account as Account | undefined)?.name ?? ''}` : `${cat?.name ?? (income ? 'Income' : 'Expense')} · ${acct?.name ?? ''}`}
                              </p>
                            </div>
                            {(tx.attachments?.length ?? 0) > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setSelectedTx(tx); const a = tx.attachments?.[0]; if (a) openAttachment(a) }}
                                title="View attachment"
                                className="shrink-0 p-0.5 rounded hover:opacity-70"
                              >
                                <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
                              </button>
                            )}
                            <span className="text-[14.5px] font-bold shrink-0" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
                              {income ? '+' : transfer ? '' : '−'}{formatCurrency(tx.amount)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!reachedEnd && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadOlder}
                disabled={loadingMore}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {loadingMore ? 'Loading…' : 'Load older transactions'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right-side detail panel — slides in, accent matches the transaction type */}
      {selectedTx && (() => {
        const income = selectedTx.type === 'income', transfer = selectedTx.type === 'transfer'
        const accent = income ? 'var(--income)' : transfer ? 'var(--transfer)' : 'var(--expense)'
        return (
          <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-center md:justify-end">
            <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedTx(null)} />
            <div className="relative w-full md:w-1/3 md:min-w-[360px] md:h-full rounded-t-3xl md:rounded-none shadow-2xl slide-up max-h-[92vh] md:max-h-none overflow-y-auto"
              style={{ background: 'var(--surface)', borderLeft: `1px solid var(--border)` }}>
              <div style={{ height: 4, background: accent }} />
              <div className="p-5">{renderDetail(selectedTx)}</div>
            </div>
          </div>
        )
      })()}

      {improveTx && (
        <AddToAssetModal
          transaction={{ id: improveTx.id, name: improveTx.name ?? null, amount: improveTx.amount, date: improveTx.date, notes: improveTx.notes }}
          onSaved={(assetName, impName) => setAssetByTxn(m => ({ ...m, [improveTx.id]: `${impName} · ${assetName}` }))}
          onClose={() => setImproveTx(null)}
        />
      )}

      {assetTx && (
        <MarkAsAssetModal
          transaction={{ id: assetTx.id, name: assetTx.name ?? null, amount: assetTx.amount, date: assetTx.date, notes: assetTx.notes }}
          onSaved={a => setAssetByTxn(m => ({ ...m, [assetTx.id]: a.name }))}
          onClose={() => setAssetTx(null)}
        />
      )}

      {showForm && (
        <TransactionForm
          transaction={editTx}
          accounts={accounts}
          categories={categories}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditTx(null) }}
        />
      )}
    </div>
  )
}
