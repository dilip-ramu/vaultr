'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  Mail, RefreshCw, ExternalLink, Download, Eye, EyeOff,
  CheckCircle2, Search, Filter, AlertTriangle, Inbox,
  ChevronDown,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

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
  status: 'new' | 'reviewed' | 'processed' | 'ignored'
  is_duplicate: boolean
  email_message_id: string | null
  created_at: string
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
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  new: { label: 'New', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  reviewed: { label: 'Reviewed', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  processed: { label: 'Processed', className: 'bg-green-50 text-green-700 border border-green-200' },
  ignored: { label: 'Ignored', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
}

function StatusBadge({ status }: { status: EmailDocument['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
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
}: Props) {
  const [documents, setDocuments] = useState<EmailDocument[]>(initialDocuments)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [senderFilter, setSenderFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [expandedBody, setExpandedBody] = useState<string | null>(null)

  // ── Derived counts ────────────────────────────────────────────────────────

  const newCount = documents.filter(d => d.status === 'new').length

  // ── Filtered documents ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return documents.filter(doc => {
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
  }, [documents, statusFilter, senderFilter, search])

  // ── Check now ─────────────────────────────────────────────────────────────

  const handleCheckNow = () => {
    setCheckResult(null)
    setCheckError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/inbox/check', { method: 'POST' })
        const json = await res.json()
        if (!res.ok) {
          setCheckError(json.error ?? 'Failed to check mailbox')
          return
        }
        setCheckResult(json.result)
        // Refresh documents list
        const docsRes = await fetch('/api/inbox/documents?status=all')
        const docsJson = await docsRes.json()
        if (docsJson.documents) setDocuments(docsJson.documents)
      } catch (e) {
        setCheckError((e as Error).message)
      }
    })
  }

  // ── Status update ─────────────────────────────────────────────────────────

  const updateStatus = (id: string, status: EmailDocument['status']) => {
    // Optimistic update
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d))

    fetch(`/api/inbox/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(res => {
      if (!res.ok) {
        // Revert on failure
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: d.status } : d))
      }
    }).catch(() => {
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: d.status } : d))
    })
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
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{pageTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{pageDescription}</p>
        </div>
        <div className="flex items-center gap-3">
          {newCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {newCount} new
            </span>
          )}
          {showCheckNow && (
            <button
              onClick={handleCheckNow}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
              {isPending ? 'Checking...' : 'Check Now'}
            </button>
          )}
        </div>
      </div>

      {/* Check result banner */}
      {checkResult && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Mailbox checked successfully</p>
            <p className="text-sm text-green-700 mt-0.5">
              Scanned {checkResult.checked} emails — {checkResult.added} new documents added, {checkResult.duplicates} duplicates skipped
            </p>
            {checkResult.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {checkResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">{e}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setCheckResult(null)}
            className="text-green-500 hover:text-green-700 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error banner */}
      {checkError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">Check failed</p>
            <p className="text-sm text-red-700 mt-0.5">{checkError}</p>
          </div>
          <button
            onClick={() => setCheckError(null)}
            className="text-red-400 hover:text-red-600 text-lg leading-none"
          >
            &times;
          </button>
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
                {filtered.map((doc, idx) => (
                  <tr
                    key={doc.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : undefined,
                    }}
                    className="transition-colors hover:bg-[var(--surface-2)]"
                  >
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
                        <div>
                          <p className="truncate font-medium" style={{ color: 'var(--text)' }}>
                            {doc.email_subject || '(no subject)'}
                          </p>
                          {doc.is_duplicate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Duplicate
                            </span>
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
                          title={doc.attachment_name}
                        >
                          <Download className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[120px]">{doc.attachment_name}</span>
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>No attachment</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={doc.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
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
                        {doc.status !== 'reviewed' && doc.status !== 'processed' && doc.status !== 'ignored' && (
                          <button
                            onClick={() => updateStatus(doc.id, 'reviewed')}
                            title="Mark as reviewed"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 transition-colors hover:bg-amber-100"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Review
                          </button>
                        )}
                        {doc.status !== 'ignored' && (
                          <button
                            onClick={() => updateStatus(doc.id, 'ignored')}
                            title="Ignore document"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 transition-colors hover:bg-gray-100"
                          >
                            <EyeOff className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
    </div>
  )
}
