'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PayrollMonth } from '@/lib/payroll/types'

interface Props {
  months: PayrollMonth[]
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

export default function ProcessingListClient({ months: initialMonths }: Props) {
  const router = useRouter()
  const [months, setMonths] = useState(initialMonths)
  const [showCreate, setShowCreate] = useState(false)
  const [newMonth, setNewMonth] = useState('')
  const [newPayDate, setNewPayDate] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

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
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return
    const res = await fetch(`/api/payroll/months/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMonths(prev => prev.filter(m => m.id !== id))
    } else {
      const d = await res.json()
      alert(d.error ?? 'Failed to delete')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Processing</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage payroll for each month</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); setNewMonth(''); setNewPayDate(''); setNewDescription('') }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Month
        </button>
      </div>

      {/* Month list */}
      {months.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No payroll months yet. Click "+ New Month" to start.
        </div>
      ) : (
        <div className="space-y-3">
          {months.map(m => (
            <div
              key={m.id}
              onClick={() => router.push(`/payroll/processing/${m.id}`)}
              className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-semibold text-gray-900">{fmtMonth(m.payroll_month)}</div>
                  {m.description && (
                    <div className="text-sm text-gray-500 mt-0.5">{m.description}</div>
                  )}
                  {m.payment_date && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Payment: {fmtDate(m.payment_date)}
                    </div>
                  )}
                </div>
                {m.is_finalized && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    ✓ Finalized
                  </span>
                )}
              </div>
              <div className="flex items-center gap-6 text-right">
                {m.expended_rate > 0 && (
                  <div>
                    <div className="text-xs text-gray-400">Expended Rate</div>
                    <div className="text-sm font-mono text-gray-700">₹{Number(m.expended_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
                {m.effective_rate > 0 && (
                  <div>
                    <div className="text-xs text-gray-400">Effective Rate</div>
                    <div className="text-sm font-mono text-gray-700">₹{Number(m.effective_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
                <button
                  onClick={(e) => handleDelete(m.id, e)}
                  className="text-xs text-red-400 hover:text-red-600 ml-2"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Payroll Month</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {createError && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{createError}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payroll Month *</label>
                <input
                  type="month"
                  value={newMonth}
                  onChange={e => setNewMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={newPayDate}
                  onChange={e => setNewPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="e.g. Salary for March"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
