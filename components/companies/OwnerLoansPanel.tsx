'use client'

// Money you personally put into this company, or took out of it.
//
// The point of recording it: the ₹1L you moved from your savings into the
// company's current account is ONE rupee amount, and it is now sitting in the
// company's cash. Without a loan entry, that ₹1L gets counted inside the
// company's equity — and your personal cash already went down — so your net worth
// silently falls by ₹1L for doing nothing but moving your own money.
//
// With the entry, the company owes you ₹1L (a receivable to you) and its equity
// drops by the same ₹1L (a payable inside it). At 100% ownership those cancel and
// the total is unchanged, which is the correct answer. At 60% you keep 40% of it,
// because your partners now owe you their share.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { inr } from '@/lib/assets/valuation'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'
import type { LoanDirection } from '@/lib/networth'

export interface OwnerLoanEntry {
  id: string
  direction: LoanDirection
  amount: number
  date: string
  note: string | null
}

const LABEL: Record<LoanDirection, string> = {
  lent: 'You lent the company',
  repaid: 'Company repaid you',
  drawn: 'You drew from the company',
  returned: 'You returned it',
}

/** +1 means the company owes you more. */
const SIGN: Record<LoanDirection, number> = { lent: 1, repaid: -1, drawn: -1, returned: 1 }

export default function OwnerLoansPanel({
  companyId, companyName, loans, balance,
}: {
  companyId: string
  companyName: string
  loans: OwnerLoanEntry[]
  /** Positive: the company owes you. Negative: you owe it. */
  balance: number
}) {
  const router = useRouter()
  const { hidden } = useBalanceVisibility()
  const m = (n: number) => (hidden ? '••••' : inr(n))

  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [direction, setDirection] = useState<LoanDirection>('lent')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')

  async function save() {
    const value = parseFloat(amount)
    if (!Number.isFinite(value) || value <= 0) {
      notify('Enter an amount greater than zero.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/owner-loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, direction, amount: value, date, note }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Could not save', 'error'); return }

      notify(`${LABEL[direction]} ${inr(value)}`, 'success')
      setAdding(false); setAmount(''); setNote('')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/owner-loans?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not delete', 'error'); return }
    router.refresh()
  }

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Your loan account</p>
          <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Money you put in or took out personally — not salary, not a sale.
          </p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* The balance, said in words, because "+₹1,00,000" alone is ambiguous
          about who owes whom — and that is the entire meaning of the number. */}
      <div className="mt-3">
        <p className="text-[22px] font-extrabold tabular-nums" style={{ color: balance < 0 ? 'var(--expense)' : 'var(--text)' }}>
          {m(Math.abs(balance))}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {balance === 0
            ? 'Settled — nothing owed either way.'
            : balance > 0
              ? `${companyName} owes you this. It is counted in your net worth, and taken off the company's equity.`
              : `You owe ${companyName} this. It is taken off your net worth.`}
        </p>
      </div>

      {adding && (
        <div className="mt-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {(['lent', 'repaid', 'drawn', 'returned'] as const).map(d => {
              const active = direction === d
              return (
                <button key={d} type="button" onClick={() => setDirection(d)}
                  className="px-3 py-2 rounded-xl text-[12px] font-semibold border text-left"
                  style={{
                    borderColor: active ? 'var(--brand)' : 'var(--border)',
                    background: active ? 'var(--brand-light)' : 'var(--surface-2)',
                    color: active ? 'var(--brand)' : 'var(--text-muted)',
                  }}>
                  {LABEL[d]}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={fld} style={fldStyle} inputMode="decimal" placeholder="Amount"
              value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            <input className={fld} style={fldStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <input className={fld} style={fldStyle} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="flex-1 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setAdding(false)}
              className="px-4 text-sm font-semibold rounded-xl"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Record the bank movement as a normal transfer too — this entry is the
            claim it created, not a second pile of money.
          </p>
        </div>
      )}

      {loans.length > 0 && (
        <div className="mt-4 space-y-1">
          {loans.map(l => (
            <div key={l.id} className="flex items-center gap-2.5 py-2" style={{ borderTop: '1px solid var(--border)' }}>
              {SIGN[l.direction] > 0
                ? <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--income)' }} />
                : <ArrowUpRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--expense)' }} />}
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{LABEL[l.direction]}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {l.date}{l.note ? ` · ${l.note}` : ''}
                </p>
              </div>
              <p className="text-[12.5px] font-bold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>{m(l.amount)}</p>
              <button onClick={() => remove(l.id)} className="p-1 shrink-0" style={{ color: 'var(--text-faint)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
