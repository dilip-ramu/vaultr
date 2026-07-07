'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { notify } from '@/components/shared/Toast'

interface Customer { id: string; name: string }

interface Props {
  /** Customers the user has, that aren't yet marked reimbursable. */
  candidates: Customer[]
  onClose: () => void
}

export default function AddReimbursableCustomerModal({ candidates, onClose }: Props) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState<string>(candidates[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!customerId) { setError('Pick a customer'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/reimbursables/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not mark customer reimbursable'); return }
      notify('Customer added to Reimbursables', 'success')
      // Switch the picker over to the new customer immediately.
      router.replace(`/customers/reimbursables?customer=${customerId}`)
      router.refresh()
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Add reimbursable customer</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {candidates.length === 0 ? (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                You don&apos;t have any customers yet that aren&apos;t already reimbursable. Add a customer first via <strong>Customers → Directory</strong>, then come back here.
              </span>
            </div>
          ) : (
            <>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Pick a customer from your directory. A payee with their name will be created automatically so you can tag expenses to them.
              </p>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Customer</span>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={busy || candidates.length === 0}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
