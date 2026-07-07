'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, CreditCard, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import type { Account } from '@/lib/types'
import { isLiability } from '@/lib/account-metrics'

interface Props {
  /** The card to pay (the *to* account of the transfer). */
  cardId: string
  cardName: string
  /** Amount the dashboard says is still due. The user can override. */
  remainingDue: number
  /** All the user's active accounts — we filter to non-liability accounts as
   *  valid sources. */
  accounts: Account[]
  onClose: () => void
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function MarkCardPaidModal({ cardId, cardName, remainingDue, accounts, onClose }: Props) {
  const router = useRouter()
  const sourceOptions = accounts.filter(a => !isLiability(a.type) && a.is_active && a.id !== cardId)
  const [fromId, setFromId] = useState<string>(sourceOptions[0]?.id ?? '')
  const [amount, setAmount] = useState<string>(remainingDue.toFixed(2))
  const [date, setDate]     = useState<string>(todayStr())
  const [error, setError]   = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)

  async function handleSubmit() {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter an amount greater than 0'); return }
    if (!fromId) { setError('Pick the bank to pay from'); return }
    setError(null); setBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error: insErr } = await supabase
        .from('transactions')
        .insert({
          user_id: user!.id,
          type: 'transfer',
          account_id: fromId,
          to_account_id: cardId,
          amount: amt,
          original_currency: 'INR',
          date,
          name: `${cardName} payment`,
        })
      if (insErr) { setError(insErr.message); setBusy(false); return }
      notify(`₹${amt.toLocaleString('en-IN')} paid to ${cardName}`, 'success')
      onClose()
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      setError(msg)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Pay {cardName}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* From */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>From bank</label>
            <select
              value={fromId}
              onChange={e => setFromId(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {sourceOptions.length === 0 && <option value="">No source bank available</option>}
              {sourceOptions.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 rounded-lg border text-sm outline-none tabular-nums"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
              Default is what the dashboard still shows due. Overpaying leaves a credit balance on the card.
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Payment date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--expense)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={busy || sourceOptions.length === 0}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'var(--brand)' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
