'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PayrollMonth } from '@/lib/payroll/types'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

// Server passes months enriched with total_payable (sum of entries' final_payable).
export type MonthWithTotal = PayrollMonth & { total_payable: number }

interface Props {
  months: MonthWithTotal[]
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtMonth(m: string): string {
  if (!m) return ''
  const parts = String(m).split('T')[0].split('-')
  const mi = parseInt(parts[1] ?? '0', 10) - 1
  if (isNaN(mi) || mi < 0 || mi > 11) return m
  return `${MONTHS_LONG[mi]} ${parts[0]}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const parts = String(d).split('T')[0].split('-')
  if (parts.length < 3) return String(d)
  const mi = parseInt(parts[1], 10) - 1
  if (isNaN(mi) || mi < 0 || mi > 11) return String(d)
  return `${parts[2]} ${MONTHS_SHORT[mi]} ${parts[0]}`
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type StatusFilter = 'all' | 'in_progress' | 'finalized' | 'settled'

function monthStatus(m: PayrollMonth): Exclude<StatusFilter, 'all'> {
  if (m.is_finalized && m.is_paid) return 'settled'
  if (m.is_finalized) return 'finalized'
  return 'in_progress'
}

function PayTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-[20px] font-extrabold tracking-tight mt-1 truncate" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

const STATUS_BADGE: Record<Exclude<StatusFilter, 'all'>, { label: string; cls: string }> = {
  settled:     { label: '✓ Settled',     cls: 'bg-[var(--brand-light)] text-[var(--income)]' },
  finalized:   { label: '✓ Finalized',   cls: 'bg-[var(--brand-light)] text-[var(--income)]' },
  in_progress: { label: 'In progress',   cls: 'bg-[var(--accent-light)] text-[var(--amber)]' },
}

export default function ProcessingListClient({ months: initialMonths }: Props) {
  const router = useRouter()
  const [months, setMonths] = useState<MonthWithTotal[]>(initialMonths)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newMonth, setNewMonth] = useState('')
  const [newPayDate, setNewPayDate] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Most-recent month by payroll_month date (list order isn't guaranteed)
  const latest = months.length
    ? months.reduce((a, b) => (String(a.payroll_month) >= String(b.payroll_month) ? a : b))
    : null

  async function handleCreate() {
    if (!newMonth) { setCreateError('Please select a month'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/payroll/months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payroll_month: newMonth,
          payment_date: newPayDate || null,
          description: newDescription.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error ?? 'Failed'); return }
      router.push(`/payroll/processing/${data.month.id}`)
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const month = months.find(m => m.id === id)
    const label = month?.is_finalized ? 'finalized payroll month (including all salary slips)' : 'payroll month'
    if (!await confirmDialog(`Delete this ${label}? This cannot be undone.`)) return
    const res = await fetch(`/api/payroll/months/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMonths(prev => prev.filter(m => m.id !== id))
    } else {
      const d = await res.json()
      notify(d.error ?? 'Failed to delete')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Payroll Processing</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Run and track payroll each month</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); setNewMonth(''); setNewPayDate(''); setNewDescription('') }}
          className="flex items-center gap-1.5 px-4 py-2 btn-brand text-white rounded-xl text-sm font-bold shrink-0 transition-colors"
        >
          + New month
        </button>
      </div>

      {/* Status band — most-recent month by date */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PayTile label={`${fmtMonth(latest.payroll_month).toUpperCase()} PAYABLE`} value={fmtInr(Number(latest.total_payable ?? 0))} color="var(--text)" />
          <PayTile label="MONTHS TRACKED" value={`${months.length}`} color="var(--brand)" />
          <PayTile label="PAY DATE" value={fmtDate(latest.payment_date)} color="var(--text)" />
          <PayTile label="STATUS" value={STATUS_BADGE[monthStatus(latest)].label.replace('✓ ', '')} color="var(--amber)" />
        </div>
      )}

      {/* Status filter */}
      {months.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all', label: 'All' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'finalized', label: 'Finalized' },
            { key: 'settled', label: 'Settled' },
          ] as { key: StatusFilter; label: string }[]).map(f => {
            const count = f.key === 'all' ? months.length : months.filter(m => monthStatus(m) === f.key).length
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === f.key ? 'btn-brand text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--border)]'
                }`}
              >
                {f.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Month ledger */}
      {months.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-faint)]">
          No payroll months yet. Click "+ New month" to start.
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-x-4 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-2)' }}>
            <span>Month</span><span>Pay date</span><span className="text-right">Payable</span><span className="text-right">Status</span>
          </div>
          {months.filter(m => filter === 'all' || monthStatus(m) === filter).sort((a, b) => String(b.payroll_month).localeCompare(String(a.payroll_month))).map(m => {
            const st = STATUS_BADGE[monthStatus(m)]
            return (
              <div
                key={m.id}
                onClick={() => router.push(`/payroll/processing/${m.id}`)}
                className="group grid grid-cols-[1.6fr_1fr_1fr_auto] gap-x-4 items-center px-5 py-3.5 cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderTop: '1px solid var(--border-2)' }}
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{fmtMonth(m.payroll_month)}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{m.description || '—'}</p>
                </div>
                <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{fmtDate(m.payment_date)}</span>
                <span className="text-[13.5px] font-bold text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtInr(Number(m.total_payable ?? 0))}</span>
                <div className="flex items-center gap-2 justify-end">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
                  <button onClick={(e) => handleDelete(m.id, e)} className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--expense)' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text)]">New Payroll Month</h2>
              <button onClick={() => setShowCreate(false)} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-xl font-light">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {createError && (
                <div className="bg-[var(--surface-2)] text-[var(--expense)] text-sm px-4 py-2 rounded-lg">{createError}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">Payroll Month *</label>
                <input
                  type="month"
                  value={newMonth}
                  onChange={e => setNewMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">Payment Date <span className="text-[var(--text-faint)] font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={newPayDate}
                  onChange={e => setNewPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">Description <span className="text-[var(--text-faint)] font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="e.g. Salary for March"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] rounded-b-2xl">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating…' : 'Create & Open'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
