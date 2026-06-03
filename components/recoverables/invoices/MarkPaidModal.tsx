'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecoverableInvoice } from '@/lib/recoverables/types'

interface Account {
  id: string
  name: string
  type: string
}

interface Props {
  invoice: RecoverableInvoice
  onClose: () => void
  onSaved: (updated: RecoverableInvoice) => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(n)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

type PaymentMode = 'full' | 'partial'

export default function MarkPaidModal({ invoice, onClose, onSaved }: Props) {
  const [accounts, setAccounts]       = useState<Account[]>([])
  const [accountId, setAccountId]     = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode]               = useState<PaymentMode>('full')
  const [paidAmount, setPaidAmount]   = useState(String(invoice.balance_due))
  const [adjAmount, setAdjAmount]     = useState('0')
  const [adjNotes, setAdjNotes]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('account_balances')
      .select('id, name, type')
      .not('type', 'in', '(credit,loan)')
      .then(({ data }) => {
        const list = data ?? []
        setAccounts(list)
        if (list[0]) setAccountId(list[0].id)
      })
  }, [])

  // When switching mode, reset amount to sensible default
  function switchMode(m: PaymentMode) {
    setMode(m)
    setPaidAmount(m === 'full' ? String(invoice.balance_due) : '')
    setAdjAmount('0')
    setAdjNotes('')
    setError('')
  }

  const balance = invoice.balance_due
  const paid    = round2(parseFloat(paidAmount) || 0)
  const adj     = round2(parseFloat(adjAmount)  || 0)

  // In full mode: TDS = balance - paid - adj  (auto-calculated, can be negative if overpaid)
  // In partial mode: no TDS
  const tds = mode === 'full' ? round2(Math.max(0, balance - paid - adj)) : 0

  // Validation helpers
  const overPaid    = mode === 'full' && paid + adj > balance + 0.01
  const zeroPaid    = paid <= 0
  const partialOver = mode === 'partial' && paid >= balance - 0.01 && paid > 0

  async function handleSubmit() {
    if (!accountId) { setError('Please select a bank account'); return }
    if (zeroPaid)   { setError('Enter an amount received'); return }
    if (overPaid)   { setError(`Amount + adjustment (${fmt(paid + adj)}) exceeds balance due (${fmt(balance)})`); return }
    if (partialOver){ setError('For a full settlement use "Full Payment" instead'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/recoverables/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount:       paid,
          tdsAmount:        tds,
          adjustmentAmount: adj,
          adjustmentNotes:  adjNotes || null,
          accountId,
          paymentDate,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      if (data.tdsError) { setError(`Payment saved, but TDS entry failed: ${data.tdsError}`); return }
      onSaved(data.invoice)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Title */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Record Payment</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {invoice.invoice_number} · {invoice.customer_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
          >
            ✕
          </button>
        </div>

        {/* Balance pill */}
        <div
          className="rounded-xl p-3 text-center"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Balance Due</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{fmt(balance)}</p>
        </div>

        {/* Full / Partial toggle */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--surface-2)' }}
        >
          {(['full', 'partial'] as PaymentMode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={
                mode === m
                  ? { background: 'var(--background)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {m === 'full' ? 'Full Payment' : 'Partial Payment'}
            </button>
          ))}
        </div>

        {/* Account */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Received In Account
          </label>
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {accounts.length === 0 && <option value="">Loading…</option>}
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Payment Date
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Amount received */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Amount Received (₹)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={e => setPaidAmount(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--surface-2)',
              border: `1px solid ${overPaid ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
              color: 'var(--text)',
            }}
          />
          {mode === 'full' && (
            <p className="text-xs mt-1 px-1" style={{ color: 'var(--text-muted)' }}>
              If less than balance due, the difference will be logged as TDS.
            </p>
          )}
        </div>

        {/* Adjustment — full payment mode only */}
        {mode === 'full' && (
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Debit Note / Adjustment (₹) <span style={{ fontWeight: 400 }}>— optional</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={adjAmount}
              onChange={e => setAdjAmount(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {adj > 0 && (
              <input
                type="text"
                placeholder="Note — e.g. offset against invoice, damage claim…"
                value={adjNotes}
                onChange={e => setAdjNotes(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm mt-1.5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            )}
          </div>
        )}

        {/* Live summary */}
        <div
          className="rounded-xl p-3.5 space-y-2 text-sm"
          style={{ background: 'var(--surface-2)', border: `1px solid ${overPaid ? 'rgba(239,68,68,0.4)' : 'var(--border)'}` }}
        >
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Received in bank</span>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(paid)}</span>
          </div>
          {tds > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>TDS (auto-calculated)</span>
              <span style={{ color: '#D97706', fontWeight: 600 }}>{fmt(tds)}</span>
            </div>
          )}
          {adj > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>
                Adjustment{adjNotes ? ` — ${adjNotes.slice(0, 28)}` : ''}
              </span>
              <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{fmt(adj)}</span>
            </div>
          )}
          <div
            className="flex justify-between pt-2 font-bold text-base"
            style={{
              borderTop: '1px solid var(--border)',
              color: overPaid
                ? '#ef4444'
                : mode === 'full'
                ? '#16a34a'
                : '#D97706',
            }}
          >
            {mode === 'full' ? (
              <>
                <span>Invoice will be marked Paid</span>
                <span>✓</span>
              </>
            ) : (
              <>
                <span>Remaining after payment</span>
                <span>{fmt(round2(Math.max(0, balance - paid)))}</span>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium px-1" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || overPaid}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#16a34a', color: '#fff' }}
          >
            {loading
              ? 'Saving…'
              : mode === 'full'
              ? '✓ Mark as Paid'
              : 'Record Partial Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
