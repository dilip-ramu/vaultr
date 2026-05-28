'use client'

import { useState, useMemo } from 'react'
import {
  Download, CheckSquare, Square, Filter, ChevronDown,
  Paperclip, CheckCircle2, Circle, AlertCircle, FileText, X
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Types ─────────────────────────────────────────────────────────────────────
interface AttachmentRaw {
  id: string
  file_name: string
  file_path: string
  content_type: string | null
  file_size: number | null
}

interface TxRaw {
  id: string
  name: string | null
  amount: number
  date: string
  type: string
  notes: string | null
  is_contrast_billed: boolean
  created_at: string
  account: { id: string; name: string; color: string; type: string } | null
  category: { id: string; name: string; icon: string; color: string } | null
  attachments: AttachmentRaw[]
}

interface Props {
  transactions: TxRaw[]
  payeeFound: boolean
  payeeName: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  const parts = d.split('-')
  if (parts.length < 3) return d
  const [y, m, day] = parts
  return `${day} ${MONTHS[parseInt(m) - 1]} ${y}`
}

function monthKey(d: string) { return d.slice(0, 7) } // "YYYY-MM"
function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function fileSizeLabel(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ContrastExpensesClient({ transactions: initialTx, payeeFound, payeeName }: Props) {
  const [transactions, setTransactions] = useState<TxRaw[]>(initialTx)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'billed' | 'unbilled'>('all')

  // Unique months in data
  const months = useMemo(() => {
    const keys = new Set(transactions.map(t => monthKey(t.date)))
    return Array.from(keys).sort().reverse()
  }, [transactions])

  // Filtered list
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const monthOk = selectedMonth === 'all' || monthKey(t.date) === selectedMonth
      const billedOk =
        filter === 'all' ? true :
        filter === 'billed' ? t.is_contrast_billed :
        !t.is_contrast_billed
      return monthOk && billedOk
    })
  }, [transactions, selectedMonth, filter])

  // Totals
  const totalAmount = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered])
  const billedAmount = useMemo(() => filtered.filter(t => t.is_contrast_billed).reduce((s, t) => s + t.amount, 0), [filtered])
  const unbilledAmount = totalAmount - billedAmount

  // Total attachments in selection
  const selectedAttachmentCount = useMemo(() => {
    return filtered
      .filter(t => selectedIds.has(t.id))
      .reduce((s, t) => s + t.attachments.length, 0)
  }, [filtered, selectedIds])

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Mark billed / unbilled ─────────────────────────────────────────────────
  const markBilled = async (ids: string[], billed: boolean) => {
    setTogglingIds(new Set(ids))
    try {
      const res = await fetch('/api/transactions/contrast-billed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, billed }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setTransactions(prev =>
        prev.map(t => ids.includes(t.id) ? { ...t, is_contrast_billed: billed } : t)
      )
      setSelectedIds(new Set())
    } catch (e) {
      alert('Could not update: ' + (e as Error).message)
    } finally {
      setTogglingIds(new Set())
    }
  }

  const toggleOneBilled = (id: string, current: boolean) => markBilled([id], !current)

  // ── Bulk attachment download ───────────────────────────────────────────────
  const downloadSelected = async () => {
    const txsWithAttachments = filtered
      .filter(t => selectedIds.has(t.id) && t.attachments.length > 0)

    if (txsWithAttachments.length === 0) {
      alert('No attachments found in selected transactions.')
      return
    }

    setDownloading(true)
    const supabase = createClient()

    try {
      // Gather all attachments with signed URLs
      const allItems: { url: string; name: string }[] = []
      for (const tx of txsWithAttachments) {
        for (const att of tx.attachments) {
          const { data } = await supabase.storage
            .from('vaultr-attachments')
            .createSignedUrl(att.file_path, 3600)
          if (data?.signedUrl) {
            // Prefix with tx date + name for clarity
            const prefix = `${tx.date}_${(tx.name ?? 'tx').replace(/[^a-zA-Z0-9]/g, '_')}`
            allItems.push({ url: data.signedUrl, name: `${prefix}_${att.file_name}` })
          }
        }
      }

      if (allItems.length === 0) {
        alert('Could not generate download links.')
        return
      }

      // Download one by one (browser handles multiple sequential downloads)
      for (const item of allItems) {
        await new Promise<void>((resolve) => {
          setTimeout(async () => {
            try {
              const res = await fetch(item.url)
              const blob = await res.blob()
              const blobUrl = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = blobUrl
              a.download = item.name
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(blobUrl)
            } catch {
              window.open(item.url, '_blank')
            }
            resolve()
          }, 300) // small stagger to avoid browser blocking multiple downloads
        })
      }
    } catch (e) {
      alert('Download failed: ' + (e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  // ── No payee found state ───────────────────────────────────────────────────
  if (!payeeFound) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contrast Expenses</h1>
            <p className="text-sm text-gray-500">Transactions linked to Contrast</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">No "Contrast" payee found</p>
            <p className="text-sm text-amber-700 mt-1">
              Create a payee named <strong>Contrast</strong> and link it to transactions to see them here.
              You can add payees when creating or editing a transaction.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contrast Expenses</h1>
            <p className="text-sm text-gray-500">
              {filtered.length} transaction{filtered.length !== 1 ? 's' : ''} · payee: {payeeName}
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Billed</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(billedAmount)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Unbilled</p>
          <p className="text-lg font-bold text-amber-600">{formatCurrency(unbilledAmount)}</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Month picker */}
        <div className="relative">
          <button
            onClick={() => setShowMonthPicker(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Filter className="w-4 h-4 text-gray-400" />
            {selectedMonth === 'all' ? 'All months' : monthLabel(selectedMonth)}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {showMonthPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[160px] py-1">
              <button
                onClick={() => { setSelectedMonth('all'); setShowMonthPicker(false) }}
                className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-50 ${selectedMonth === 'all' ? 'font-semibold text-purple-600' : 'text-gray-700'}`}
              >
                All months
              </button>
              {months.map(m => (
                <button
                  key={m}
                  onClick={() => { setSelectedMonth(m); setShowMonthPicker(false) }}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-50 ${selectedMonth === m ? 'font-semibold text-purple-600' : 'text-gray-700'}`}
                >
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Billed filter */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['all', 'unbilled', 'billed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bulk actions (shown when selection active) */}
        {someSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{selectedIds.size} selected</span>

            {/* Download */}
            <button
              onClick={downloadSelected}
              disabled={downloading || selectedAttachmentCount === 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                selectedAttachmentCount === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
              title={selectedAttachmentCount === 0 ? 'No attachments in selection' : `Download ${selectedAttachmentCount} attachment${selectedAttachmentCount !== 1 ? 's' : ''}`}
            >
              {downloading
                ? <span className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <Download className="w-3.5 h-3.5" />
              }
              {downloading ? 'Downloading…' : `Download (${selectedAttachmentCount})`}
            </button>

            {/* Mark as billed */}
            <button
              onClick={() => markBilled(Array.from(selectedIds), true)}
              disabled={togglingIds.size > 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark billed
            </button>

            {/* Mark as unbilled */}
            <button
              onClick={() => markBilled(Array.from(selectedIds), false)}
              disabled={togglingIds.size > 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
            >
              <Circle className="w-3.5 h-3.5" />
              Mark unbilled
            </button>

            {/* Clear selection */}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <button onClick={toggleAll} className="shrink-0 text-gray-400 hover:text-gray-600">
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-purple-600" />
              : <Square className="w-4 h-4" />
            }
          </button>
          <span className="text-xs font-medium text-gray-500 flex-1">Transaction</span>
          <span className="text-xs font-medium text-gray-500 w-24 text-right hidden sm:block">Amount</span>
          <span className="text-xs font-medium text-gray-500 w-24 text-center hidden md:block">Attachments</span>
          <span className="text-xs font-medium text-gray-500 w-20 text-center">Status</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(tx => {
              const isSelected = selectedIds.has(tx.id)
              const isToggling = togglingIds.has(tx.id)
              return (
                <div
                  key={tx.id}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-purple-50/50' : ''}`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleOne(tx.id)}
                    className="shrink-0 text-gray-400 hover:text-purple-600"
                  >
                    {isSelected
                      ? <CheckSquare className="w-4 h-4 text-purple-600" />
                      : <Square className="w-4 h-4" />
                    }
                  </button>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.name ?? tx.category?.name ?? 'Expense'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{fmtDate(tx.date)}</span>
                      {tx.account && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                          style={{
                            backgroundColor: `${tx.account.color}18`,
                            color: tx.account.color,
                          }}
                        >
                          {tx.account.name}
                        </span>
                      )}
                      {tx.notes && (
                        <span className="text-xs text-gray-400 italic truncate max-w-[120px]">{tx.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="w-24 text-right hidden sm:block shrink-0">
                    <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>

                  {/* Attachments count */}
                  <div className="w-24 hidden md:flex items-center justify-center shrink-0">
                    {tx.attachments.length > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                        <Paperclip className="w-3 h-3" />
                        {tx.attachments.length}
                        <span className="text-gray-400 text-xs">
                          {tx.attachments.map(a => fileExt(a.file_name)).join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  {/* Billed toggle */}
                  <div className="w-20 flex justify-center shrink-0">
                    <button
                      onClick={() => toggleOneBilled(tx.id, tx.is_contrast_billed)}
                      disabled={isToggling}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        tx.is_contrast_billed
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                      } ${isToggling ? 'opacity-50' : ''}`}
                    >
                      {isToggling ? (
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : tx.is_contrast_billed ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Circle className="w-3 h-3" />
                      )}
                      {tx.is_contrast_billed ? 'Billed' : 'Unbilled'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer totals */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              {filtered.length} transactions · {filtered.reduce((s, t) => s + t.attachments.length, 0)} attachments
            </span>
            <span className="text-sm font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
