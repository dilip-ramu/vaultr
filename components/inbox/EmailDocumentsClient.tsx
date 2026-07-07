'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Mail, RefreshCw, ExternalLink, Download, Eye, EyeOff,
  CheckCircle2, Search, Filter, AlertTriangle, Inbox,
  ChevronDown, X, FileText, Zap, ArrowUpRight, Trash2,
  RotateCcw, Square, CheckSquare, MinusSquare, ClipboardCheck,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import ReviewModal from './ReviewModal'
import BulkActionsBar from './BulkActionsBar'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailDocument {
  id: string
  user_id: string
  integration_id: string | null
  sender_email: string
  sender_name: string | null
  email_subject: string | null
  email_body: string | null
  attachment_name: string | null
  attachment_url: string | null
  storage_path: string | null
  received_at: string | null
  status: 'new' | 'reviewed' | 'processed' | 'ignored' | 'processing' | 'invoice_created' | 'needs_review' | 'duplicate_suspected'
  is_duplicate: boolean
  email_message_id: string | null
  created_at: string
  // extraction / processing fields
  extraction_confidence: number | null
  supplier_invoice_id: string | null
  processing_error: string | null
  extracted_supplier_name: string | null
  extracted_invoice_number: string | null
  extracted_invoice_date: string | null
  extracted_due_date: string | null
  extracted_currency: string | null
  extracted_amount: number | null
  extracted_gst_amount: number | null
  renamed_filename: string | null
}

interface SenderOption {
  email: string
  name: string | null
}

interface CheckResult {
  checked: number
  added: number
  duplicates: number
  errors: string[]
}

interface Props {
  initialDocuments: EmailDocument[]
  senderOptions: SenderOption[]
  pageTitle?: string
  pageDescription?: string
  showCheckNow?: boolean
  hideHeader?: boolean
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EmailDocument['status'], { label: string; className: string }> = {
  new:                  { label: 'New',               className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  reviewed:             { label: 'Reviewed',          className: 'bg-[var(--accent-light)] text-[var(--amber)] border border-[var(--border)]' },
  processed:            { label: 'Processed',         className: 'bg-[var(--brand-light)] text-[var(--income)] border border-[var(--border)]' },
  ignored:              { label: 'Ignored',           className: 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]' },
  processing:           { label: 'Processing',        className: 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]' },
  invoice_created:      { label: 'Invoice Created',   className: 'bg-[var(--brand-light)] text-[var(--income)] border border-[var(--border)]' },
  needs_review:         { label: 'Needs Review',      className: 'bg-[var(--surface-2)] text-[var(--expense)] border border-[var(--border)]' },
  duplicate_suspected:  { label: 'Duplicate',         className: 'bg-orange-50 text-orange-700 border border-orange-200' },
}

function StatusBadge({ status, isProcessingRow }: { status: EmailDocument['status']; isProcessingRow?: boolean }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {(status === 'processing' || isProcessingRow) && (
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
      )}
      {cfg.label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmailDocumentsClient({
  initialDocuments,
  senderOptions,
  pageTitle = 'Email Documents',
  pageDescription = 'Documents received from monitored email senders',
  showCheckNow = true,
  hideHeader = false,
}: Props) {
  const [documents, setDocuments] = useState<EmailDocument[]>(initialDocuments)

  // The Fetch Invoices tab passes only Supplier-flagged senders in
  // senderOptions. Every client-side refetch must honour that filter,
  // otherwise a refresh (Check Now poll, or after clicking Process) pulls in
  // documents from transaction-alert senders too and the list balloons.
  // When senderOptions is missing (e.g. the /inbox/processed page), fall
  // through to no filtering.
  const allowedSenders = useMemo(() => {
    if (!senderOptions || senderOptions.length === 0) return null
    return new Set(senderOptions.map(s => s.email.toLowerCase()))
  }, [senderOptions])
  const applyAllowedFilter = (docs: EmailDocument[]) => {
    if (!allowedSenders) return docs
    return docs.filter(d => allowedSenders.has((d.sender_email ?? '').toLowerCase()))
  }
  // pageTab separates active (not invoiced) vs invoiced docs
  const [pageTab, setPageTab] = useState<'active' | 'needs_review' | 'reviewed' | 'invoiced'>('active')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [senderFilter, setSenderFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [isCheckingBackground, setIsCheckingBackground] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expandedBody, setExpandedBody] = useState<string | null>(null)
  const [readDoc, setReadDoc] = useState<EmailDocument | null>(null)
  const [reviewDoc, setReviewDoc] = useState<EmailDocument | null>(null)
  const [confirmRedoDoc, setConfirmRedoDoc] = useState<EmailDocument | null>(null)
  const [redoing, setRedoing] = useState(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Derived counts ────────────────────────────────────────────────────────

  const newCount = documents.filter(d => d.status === 'new').length

  // ── Filtered documents ────────────────────────────────────────────────────

  // Tab-level filter first, then search/sender filters within each tab
  const tabDocs = useMemo(() => {
    if (pageTab === 'invoiced')     return documents.filter(d => d.status === 'invoice_created')
    if (pageTab === 'needs_review') return documents.filter(d => d.status === 'needs_review' || d.status === 'duplicate_suspected')
    if (pageTab === 'reviewed')     return documents.filter(d => d.status === 'reviewed' || d.status === 'processed')
    // active: everything except invoice_created (the default)
    return documents.filter(d => d.status !== 'invoice_created')
  }, [documents, pageTab])

  const filtered = useMemo(() => {
    return tabDocs.filter(doc => {
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false
      if (senderFilter !== 'all' && doc.sender_email !== senderFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [
          doc.email_subject, doc.sender_email, doc.sender_name, doc.attachment_name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [tabDocs, statusFilter, senderFilter, search])

  // ── Background polling ────────────────────────────────────────────────────

  // Poll documents every 6 s while a background check is in progress.
  // Also watch last_checked_at on the integration — when it advances the check is done.
  useEffect(() => {
    if (!isCheckingBackground) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    let lastCheckedAt: string | null = null
    let consecutiveSameCount = 0
    const STOP_AFTER = 30 // ~3 min at 6 s intervals

    const tick = async () => {
      try {
        // Refresh document list. IMPORTANT: filter by allowed senders too so
        // a Supplier tab refresh doesn't sneak in transaction-alert emails.
        const docsRes = await fetch('/api/inbox/documents?status=all')
        const docsJson = await docsRes.json()
        if (docsJson.documents) {
          setDocuments(
            applyAllowedFilter(
              (docsJson.documents as EmailDocument[]).filter(d => d.status !== 'ignored')
            )
          )
        }

        // Check integration last_checked_at to detect completion
        const intRes = await fetch('/api/inbox/integrations')
        const intJson = await intRes.json()
        const newLastChecked: string | null = intJson.integration?.last_checked_at ?? null

        if (newLastChecked && newLastChecked !== lastCheckedAt) {
          if (lastCheckedAt !== null) {
            // last_checked_at advanced → check is complete
            setIsCheckingBackground(false)
            setCheckResult({ checked: 0, added: 0, duplicates: 0, errors: [] }) // triggers success banner
          }
          lastCheckedAt = newLastChecked
          consecutiveSameCount = 0
        } else {
          consecutiveSameCount++
          if (consecutiveSameCount >= STOP_AFTER) {
            // Timeout — stop polling after ~3 min regardless
            setIsCheckingBackground(false)
          }
        }
      } catch { /* ignore transient errors */ }
    }

    // Start immediately, then repeat
    tick()
    pollRef.current = setInterval(tick, 6000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [isCheckingBackground])

  // ── Check now ─────────────────────────────────────────────────────────────

  const handleCheckNow = async () => {
    setCheckResult(null)
    setCheckError(null)
    try {
      const res = await fetch('/api/inbox/check', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setCheckError(json.error ?? 'Failed to check mailbox')
        return
      }
      // API returns immediately with { started: true } — kick off background polling
      if (json.started) {
        setIsCheckingBackground(true)
      }
    } catch (e) {
      setCheckError((e as Error).message)
    }
  }

  // ── Status update ─────────────────────────────────────────────────────────

  const updateStatus = (id: string, status: EmailDocument['status']) => {
    // Capture old status before optimistic update so we can revert correctly
    const oldStatus = documents.find(d => d.id === id)?.status ?? 'new'
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d))

    fetch(`/api/inbox/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(res => {
      if (!res.ok) {
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: oldStatus } : d))
      }
    }).catch(() => {
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: oldStatus } : d))
    })
  }

  // ── Process document ──────────────────────────────────────────────────────

  const handleProcess = async (docId: string) => {
    setProcessingIds(prev => new Set(prev).add(docId))
    // Optimistic: mark as processing
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'processing' as const } : d))

    try {
      const res = await fetch(`/api/inbox/documents/${docId}/process`, { method: 'POST' })
      const json = await res.json()

      if (!res.ok) {
        // Revert to 'new' on hard HTTP error
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'new' as const } : d))
        return
      }

      // Refresh this document's data from the server to get all updated fields.
      // Filter to the allowed senders so the list doesn't expand to include
      // transaction-alert emails on the Fetch Invoices tab.
      const docRes = await fetch(`/api/inbox/documents?status=all`)
      const docJson = await docRes.json()
      if (docJson.documents) {
        setDocuments(applyAllowedFilter(docJson.documents as EmailDocument[]))
      } else {
        // Fallback: update status from result
        const resultStatus = json.result?.status as EmailDocument['status'] | undefined
        if (resultStatus) {
          setDocuments(prev =>
            prev.map(d => d.id === docId ? {
              ...d,
              status: resultStatus,
              supplier_invoice_id: json.result?.supplier_invoice_id ?? d.supplier_invoice_id,
            } : d)
          )
        }
      }
    } catch {
      // On network error, revert
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'new' as const } : d))
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  // ── Redo (mark as new) — with confirmation + delete linked invoice ────────

  const handleConfirmRedo = async () => {
    if (!confirmRedoDoc) return
    setRedoing(true)
    const doc = confirmRedoDoc

    // Delete linked supplier invoice if present
    if (doc.supplier_invoice_id) {
      await fetch(`/api/inbox/documents/${doc.id}/redo`, { method: 'POST' })
    }

    // Reset document to 'new'
    const oldStatus = doc.status
    setDocuments(prev => prev.map(d => d.id === doc.id
      ? { ...d, status: 'new' as const, supplier_invoice_id: null, processing_error: null }
      : d
    ))
    fetch(`/api/inbox/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'new' }),
    }).catch(() => {
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: oldStatus } : d))
    })

    setRedoing(false)
    setConfirmRedoDoc(null)
  }

  // ── Review approved ──────────────────────────────────────────────────────

  const handleApproved = (docId: string, _invoiceId: string) => {
    // Remove from the list immediately — once approved the email has served its purpose
    setDocuments(prev => prev.filter(d => d.id !== docId))
    setReviewDoc(null)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteDoc = async (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id))
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    await fetch(`/api/inbox/documents/${id}`, { method: 'DELETE' })
  }

  // ── Bulk helpers ──────────────────────────────────────────────────────────

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(d => d.id)))
    }
  }

  const bulkUpdateStatus = async (status: EmailDocument['status']) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setDocuments(prev => prev.map(d => ids.includes(d.id) ? { ...d, status } : d))
    setSelectedIds(new Set())
    // One DB round-trip instead of N parallel HTTPs — same auth via RLS.
    const supabase = createClient()
    const { error } = await supabase
      .from('email_documents')
      .update({ status })
      .in('id', ids)
    if (error) notify(error.message, 'error')
  }

  const bulkDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!await confirmDialog({
      title: `Delete ${ids.length} document${ids.length === 1 ? '' : 's'}?`,
      message: 'They\'ll be hidden from this inbox and won\'t be re-imported.',
      confirmLabel: 'Delete all',
    })) return
    // Soft-delete in one round-trip — matches the single-row API's behaviour
    // (status='ignored' so dedup keeps blocking re-imports).
    const supabase = createClient()
    const { error } = await supabase
      .from('email_documents')
      .update({ status: 'ignored' })
      .in('id', ids)
    if (error) { notify(error.message, 'error'); return }
    setDocuments(prev => prev.filter(d => !ids.includes(d.id)))
    setSelectedIds(new Set())
    notify(`${ids.length} document${ids.length === 1 ? '' : 's'} deleted`, 'success')
  }

  // ── Unique senders from docs ──────────────────────────────────────────────

  const allSenders = useMemo(() => {
    const seen = new Set<string>()
    const result: SenderOption[] = []
    for (const doc of documents) {
      if (!seen.has(doc.sender_email)) {
        seen.add(doc.sender_email)
        result.push({ email: doc.sender_email, name: doc.sender_name })
      }
    }
    // Also include senderOptions that may not have docs yet
    for (const s of senderOptions) {
      if (!seen.has(s.email)) {
        seen.add(s.email)
        result.push(s)
      }
    }
    return result.sort((a, b) => a.email.localeCompare(b.email))
  }, [documents, senderOptions])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {!hideHeader ? (
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{pageTitle}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{pageDescription}</p>
          </div>
        ) : <div />}
        <div className="flex items-center gap-3">
          {newCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {newCount} new
            </span>
          )}
          {showCheckNow && (
            <button
              onClick={handleCheckNow}
              disabled={isCheckingBackground}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingBackground ? 'animate-spin' : ''}`} />
              {isCheckingBackground ? 'Checking…' : 'Check Now'}
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      {(() => {
        const tabs = [
          { key: 'active'       as const, label: 'Active',       count: documents.filter(d => d.status !== 'invoice_created').length },
          { key: 'needs_review' as const, label: 'Needs Review', count: documents.filter(d => d.status === 'needs_review' || d.status === 'duplicate_suspected').length },
          { key: 'reviewed'     as const, label: 'Reviewed',     count: documents.filter(d => d.status === 'reviewed' || d.status === 'processed').length },
          { key: 'invoiced'     as const, label: 'Invoiced',     count: documents.filter(d => d.status === 'invoice_created').length },
        ]
        return (
          <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2)' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setPageTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
                style={
                  pageTab === t.key
                    ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: pageTab === t.key ? 'var(--brand)' : 'var(--border)',
                      color: pageTab === t.key ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Background-check banner */}
      {isCheckingBackground && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 animate-spin" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800">Checking email in background</p>
            <p className="text-sm text-blue-600 mt-0.5">New documents will appear here automatically. You can navigate freely.</p>
          </div>
          <button onClick={() => setIsCheckingBackground(false)} className="text-blue-400 hover:text-blue-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Check result banner */}
      {checkResult && !isCheckingBackground && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--brand-light)] px-4 py-3 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[var(--income)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--income)]">Mailbox check complete</p>
            <p className="text-sm text-[var(--income)] mt-0.5">Document list refreshed — any new emails have been added.</p>
            {checkResult.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {checkResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-[var(--expense)]">{e}</li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setCheckResult(null)} className="text-[var(--income)] hover:text-[var(--income)] text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Error banner */}
      {checkError && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--expense)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--expense)]">Check failed</p>
            <p className="text-sm text-[var(--expense)] mt-0.5">{checkError}</p>
          </div>
          <button onClick={() => setCheckError(null)} className="text-[var(--expense)] hover:text-[var(--expense)] text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div
        className="rounded-2xl border shadow-sm px-4 py-3"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
            <input
              type="text"
              placeholder="Search subject, sender, attachment..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
              style={{
                backgroundColor: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-xl border text-sm outline-none appearance-none cursor-pointer"
              style={{
                backgroundColor: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="processed">Processed</option>
              <option value="ignored">Ignored</option>
              <option value="processing">Processing</option>
              <option value="invoice_created">Invoice Created</option>
              <option value="needs_review">Needs Review</option>
              <option value="duplicate_suspected">Duplicate</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
          </div>

          {/* Sender filter */}
          {allSenders.length > 0 && (
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
              <select
                value={senderFilter}
                onChange={e => setSenderFilter(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-xl border text-sm outline-none appearance-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                <option value="all">All Senders</option>
                {allSenders.map(s => (
                  <option key={s.email} value={s.email}>
                    {s.name ? `${s.name} (${s.email})` : s.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionsBar
        count={selectedIds.size}
        onBulkStatus={bulkUpdateStatus}
        onBulkDelete={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Table */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Inbox className="w-12 h-12 mb-3" style={{ color: 'var(--text-faint)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--text)' }}>No documents found</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {documents.length === 0
                ? 'Click "Check Now" to fetch emails from your connected account'
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Select-all checkbox */}
                  <th className="pl-4 pr-2 py-3" style={{ backgroundColor: 'var(--surface-2)', width: 36 }}>
                    <button onClick={toggleSelectAll}>
                      {selectedIds.size === filtered.length && filtered.length > 0
                        ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                        : selectedIds.size > 0
                          ? <MinusSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                          : <Square className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />}
                    </button>
                  </th>
                  {['Date', 'Sender', 'Subject', 'Attachment', 'Status', 'Actions'].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-faint)', backgroundColor: 'var(--surface-2)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc, idx) => {
                  const isRowProcessing = processingIds.has(doc.id)
                  const isSelected = selectedIds.has(doc.id)
                  return (
                    <tr
                      key={doc.id}
                      style={{
                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : undefined,
                        opacity: isRowProcessing ? 0.7 : 1,
                        backgroundColor: isSelected ? 'var(--brand-light)' : undefined,
                      }}
                      className="transition-colors hover:bg-[var(--surface-2)]"
                    >
                      {/* Checkbox */}
                      <td className="pl-4 pr-2 py-3">
                        <button onClick={() => toggleSelect(doc.id)}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                            : <Square className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />}
                        </button>
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {doc.received_at
                          ? format(parseISO(doc.received_at), 'dd MMM yyyy')
                          : '—'}
                        <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                          {doc.received_at ? format(parseISO(doc.received_at), 'HH:mm') : ''}
                        </div>
                      </td>

                      {/* Sender */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="font-medium truncate" style={{ color: 'var(--text)' }}>
                          {doc.sender_name || doc.sender_email}
                        </div>
                        {doc.sender_name && (
                          <div className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>
                            {doc.sender_email}
                          </div>
                        )}
                      </td>

                      {/* Subject */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium" style={{ color: 'var(--text)' }}>
                              {doc.email_subject || '(no subject)'}
                            </p>
                            {doc.is_duplicate && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 mt-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Duplicate
                              </span>
                            )}
                            {/* Extracted details for processed docs */}
                            {(doc.extracted_supplier_name || doc.extracted_invoice_number) && (
                              <div className="mt-1 space-y-0.5">
                                {doc.extracted_supplier_name && (
                                  <p className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>
                                    {doc.extracted_supplier_name}
                                  </p>
                                )}
                                {doc.extracted_invoice_number && (
                                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                                    #{doc.extracted_invoice_number}
                                    {doc.extracted_amount != null ? ` · ${doc.extracted_amount}` : ''}
                                  </p>
                                )}
                              </div>
                            )}
                            {/* Processing error */}
                            {doc.status === 'needs_review' && doc.processing_error && (
                              <p className="text-[10px] text-[var(--expense)] mt-0.5 truncate">
                                {doc.processing_error}
                              </p>
                            )}
                          </div>
                          {doc.email_body && (
                            <button
                              onClick={() => setExpandedBody(expandedBody === doc.id ? null : doc.id)}
                              className="shrink-0 mt-0.5"
                              title="Toggle email body"
                              style={{ color: 'var(--text-faint)' }}
                            >
                              {expandedBody === doc.id
                                ? <EyeOff className="w-3.5 h-3.5" />
                                : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        {expandedBody === doc.id && doc.email_body && (
                          <div
                            className="mt-2 p-2 rounded-lg text-xs whitespace-pre-wrap max-h-32 overflow-y-auto"
                            style={{
                              backgroundColor: 'var(--surface-2)',
                              color: 'var(--text-muted)',
                              borderLeft: '2px solid var(--border)',
                            }}
                          >
                            {doc.email_body}
                          </div>
                        )}
                      </td>

                      {/* Attachment */}
                      <td className="px-4 py-3 max-w-[160px]">
                        {doc.attachment_name ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                            title={doc.renamed_filename ?? doc.attachment_name}
                          >
                            <Download className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[120px]">
                              {doc.renamed_filename ?? doc.attachment_name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>No attachment</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={doc.status} isProcessingRow={isRowProcessing} />
                        {doc.extraction_confidence != null && doc.status !== 'new' && (
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {Math.round(doc.extraction_confidence * 100)}% confidence
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {doc.email_body && (
                            <button
                              onClick={() => setReadDoc(doc)}
                              title="Read email message"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:bg-[var(--surface-2)]"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            >
                              <FileText className="w-3 h-3" />
                              Read
                            </button>
                          )}
                          {doc.attachment_url && (
                            <>
                              <a
                                href={doc.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View attachment"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:bg-[var(--surface-2)]"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </a>
                              <a
                                href={doc.attachment_url}
                                download={doc.attachment_name ?? undefined}
                                title="Download attachment"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:bg-[var(--surface-2)]"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              >
                                <Download className="w-3 h-3" />
                              </a>
                            </>
                          )}

                          {/* Process / Retry button */}
                          {(doc.status === 'new' || doc.status === 'needs_review') && doc.storage_path && !isRowProcessing && (
                            <button
                              onClick={() => handleProcess(doc.id)}
                              title="Auto-process: extract and create invoice"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 transition-colors hover:bg-indigo-100"
                            >
                              <Zap className="w-3 h-3" />
                              {doc.status === 'needs_review' ? 'Retry' : 'Process'}
                            </button>
                          )}

                          {/* Review button — always available for docs with an attachment */}
                          {doc.storage_path && !isRowProcessing && doc.status !== 'invoice_created' && doc.status !== 'ignored' && (
                            <button
                              onClick={() => setReviewDoc(doc)}
                              title="Review extracted data side-by-side with the email"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 transition-colors hover:bg-violet-100"
                            >
                              <ClipboardCheck className="w-3 h-3" />
                              Review
                            </button>
                          )}

                          {/* Loading state while processing */}
                          {isRowProcessing && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Processing…
                            </span>
                          )}

                          {/* View Invoice link — search for the specific invoice by number */}
                          {(doc.status === 'invoice_created' || (doc.supplier_invoice_id && doc.status === 'needs_review')) && doc.supplier_invoice_id && (
                            <a
                              href={`/suppliers/invoices?search=${encodeURIComponent(doc.extracted_invoice_number ?? doc.supplier_invoice_id)}`}
                              title="View the created invoice"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--brand-light)] text-[var(--income)] border border-[var(--border)] transition-colors hover:bg-[var(--brand-light)]"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                              View Invoice
                            </a>
                          )}

                          {doc.status !== 'new' && !isRowProcessing && (
                            <button
                              onClick={() => setConfirmRedoDoc(doc)}
                              title="Redo — reset to new (will delete linked invoice)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 transition-colors hover:bg-blue-100"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                          {doc.status !== 'ignored' && !isRowProcessing && (
                            <button
                              onClick={() => updateStatus(doc.id, 'ignored')}
                              title="Ignore document"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]"
                            >
                              <EyeOff className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteDoc(doc.id)}
                            title="Delete record"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-[var(--expense)] border border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div
            className="px-4 py-2.5 border-t text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
          >
            Showing {filtered.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Redo confirmation dialog */}
      {confirmRedoDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmRedoDoc(null)}>
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Reset this document?</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
              This will reset the document to <strong>New</strong> so you can re-process it.
            </p>
            {confirmRedoDoc.supplier_invoice_id && (
              <p className="text-sm font-medium mt-2 mb-4" style={{ color: '#dc2626' }}>
                The linked supplier invoice will also be permanently deleted.
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setConfirmRedoDoc(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRedo}
                disabled={redoing}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#dc2626' }}
              >
                {redoing ? 'Resetting…' : 'Yes, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewDoc && (
        <ReviewModal
          doc={reviewDoc}
          onClose={() => setReviewDoc(null)}
          onApproved={handleApproved}
        />
      )}

      {/* Read message modal */}
      {readDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReadDoc(null)}>
          <div
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-faint)' }}>
                  {readDoc.sender_name || readDoc.sender_email}
                  {readDoc.sender_name && <span className="ml-1" style={{ color: 'var(--text-faint)' }}>({readDoc.sender_email})</span>}
                </p>
                <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {readDoc.email_subject || '(no subject)'}
                </h2>
                {readDoc.received_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {format(parseISO(readDoc.received_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setReadDoc(null)}
                className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: 'var(--text-faint)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attachment pill */}
            {readDoc.attachment_name && (
              <div className="px-6 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
                <Download className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {readDoc.renamed_filename ?? readDoc.attachment_name}
                </span>
                {readDoc.attachment_url && (
                  <a
                    href={readDoc.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors hover:bg-[var(--surface)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <ExternalLink className="w-3 h-3" /> Open PDF
                  </a>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre
                className="text-sm whitespace-pre-wrap font-sans leading-relaxed"
                style={{ color: 'var(--text)' }}
              >
                {readDoc.email_body || '(no message body)'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
