'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface TDSEntry {
  id: string
  invoice_id: string | null
  invoice_number: string
  customer_name: string
  invoice_total: number
  paid_amount: number
  tds_amount: number
  adjustment_amount: number
  adjustment_notes: string | null
  payment_date: string
  settled: boolean
  settled_at: string | null
  created_at: string
}

interface Props {
  entries: TDSEntry[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

type Tab = 'pending' | 'settled'

export default function TDSClient({ entries: initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [tab, setTab]         = useState<Tab>('pending')
  const [settling, setSettling] = useState<string | null>(null)  // entry id being toggled
  const [settlingAll, setSettlingAll] = useState(false)
  const [error, setError] = useState('')

  const pending  = useMemo(() => entries.filter(e => !e.settled), [entries])
  const settled  = useMemo(() => entries.filter(e => e.settled),  [entries])
  const visible  = tab === 'pending' ? pending : settled

  const pendingTDS = useMemo(() => pending.reduce((s, e) => s + e.tds_amount, 0), [pending])
  const pendingAdj = useMemo(() => pending.reduce((s, e) => s + e.adjustment_amount, 0), [pending])
  const settledTDS = useMemo(() => settled.reduce((s, e) => s + e.tds_amount, 0), [settled])

  // Group visible entries by customer
  const byCustomer = useMemo(() => {
    const map = new Map<string, { entries: TDSEntry[]; tds: number; adj: number }>()
    for (const e of visible) {
      const g = map.get(e.customer_name) ?? { entries: [], tds: 0, adj: 0 }
      g.entries.push(e)
      g.tds += e.tds_amount
      g.adj += e.adjustment_amount
      map.set(e.customer_name, g)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tds - a[1].tds)
  }, [visible])

  async function toggleSettle(entry: TDSEntry) {
    setSettling(entry.id)
    setError('')
    try {
      const res = await fetch(`/api/recoverables/tds/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settled: !entry.settled }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return }
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...data.entry } : e))
    } catch {
      setError('Network error — please try again')
    } finally {
      setSettling(null)
    }
  }

  async function settleAll() {
    if (!confirm(`Mark all ${pending.length} pending TDS entries as settled? This is typically done once a year after filing.`)) return
    setSettlingAll(true)
    setError('')
    try {
      const res = await fetch('/api/recoverables/tds', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      const now = new Date().toISOString()
      setEntries(prev => prev.map(e => e.settled ? e : { ...e, settled: true, settled_at: now }))
      setTab('settled')
    } catch {
      setError('Network error — please try again')
    } finally {
      setSettlingAll(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>TDS Tracker</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Tax deducted at source — amounts claimable as credit
            </p>
          </div>
          <Link
            href="/recoverables/invoices"
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ← Invoices
          </Link>
        </div>

        {entries.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>No TDS entries yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              When you record a full payment with a shortfall, the difference is logged here as TDS.
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #D97706' }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Pending TDS</p>
                <p className="text-xl font-bold" style={{ color: '#D97706' }}>{fmt(pendingTDS)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {pending.length} entr{pending.length === 1 ? 'y' : 'ies'} · claimable
                </p>
              </div>
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #16a34a' }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Settled TDS</p>
                <p className="text-xl font-bold" style={{ color: '#16a34a' }}>{fmt(settledTDS)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {settled.length} entr{settled.length === 1 ? 'y' : 'ies'} · filed
                </p>
              </div>
            </div>

            {/* Settle all banner */}
            {pending.length > 0 && (
              <div
                className="rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3"
                style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#92400e' }}>
                    {pending.length} pending · {fmt(pendingTDS + pendingAdj)} total
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
                    Mark all as settled after filing your annual TDS return.
                  </p>
                </div>
                <button
                  onClick={settleAll}
                  disabled={settlingAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
                  style={{ background: '#D97706', color: '#fff' }}
                >
                  {settlingAll ? 'Settling…' : 'Settle All'}
                </button>
              </div>
            )}

            {/* Tabs */}
            <div
              className="flex gap-1 p-1 rounded-xl mb-5"
              style={{ background: 'var(--surface-2)' }}
            >
              {(['pending', 'settled'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={
                    tab === t
                      ? { background: 'var(--background)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  {t === 'pending' ? `Pending (${pending.length})` : `Settled (${settled.length})`}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-xs font-medium mb-3 px-1" style={{ color: '#ef4444' }}>{error}</p>
            )}

            {/* Entries */}
            {visible.length === 0 ? (
              <div
                className="rounded-xl p-10 text-center"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <p className="text-3xl mb-2">{tab === 'pending' ? '✓' : '📂'}</p>
                <p className="font-medium">
                  {tab === 'pending' ? 'All TDS entries are settled' : 'No settled entries yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {byCustomer.map(([customer, group]) => (
                  <div key={customer}>
                    {/* Customer header */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{customer}</p>
                      <div className="flex items-center gap-3 text-xs font-semibold">
                        {group.tds > 0 && (
                          <span style={{ color: '#D97706' }}>TDS {fmt(group.tds)}</span>
                        )}
                        {group.adj > 0 && (
                          <span style={{ color: '#6366F1' }}>Adj {fmt(group.adj)}</span>
                        )}
                      </div>
                    </div>

                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      {group.entries.map((entry, i) => (
                        <div
                          key={entry.id}
                          className="px-4 py-3.5"
                          style={{
                            borderBottom: i < group.entries.length - 1 ? '1px solid var(--border-2)' : 'none',
                            opacity: entry.settled ? 0.7 : 1,
                          }}
                        >
                          {/* Row 1: Invoice + date + settle button */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {entry.invoice_id ? (
                                <Link
                                  href={`/recoverables/invoices/${entry.invoice_id}`}
                                  className="text-sm font-bold hover:underline"
                                  style={{ color: 'var(--brand)' }}
                                >
                                  {entry.invoice_number}
                                </Link>
                              ) : (
                                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                                  {entry.invoice_number}
                                </span>
                              )}
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full"
                                style={{
                                  background: entry.settled ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                                  color:      entry.settled ? '#16a34a' : '#D97706',
                                }}
                              >
                                {entry.settled ? '✓ Settled' : 'Pending'}
                              </span>
                            </div>
                            <button
                              onClick={() => toggleSettle(entry)}
                              disabled={settling === entry.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50 whitespace-nowrap"
                              style={
                                entry.settled
                                  ? { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                                  : { background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.25)' }
                              }
                            >
                              {settling === entry.id
                                ? '…'
                                : entry.settled
                                ? 'Unsettle'
                                : '✓ Settle'}
                            </button>
                          </div>

                          {/* Row 2: Date + customer (for context within group) */}
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(entry.payment_date)}
                            {entry.settled_at && (
                              <span> · Settled {fmtDate(entry.settled_at)}</span>
                            )}
                          </p>

                          {/* Row 3: Amounts */}
                          <div className="flex items-center gap-4 mt-2 flex-wrap">
                            <div>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Invoice Total</p>
                              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fmt(entry.invoice_total)}</p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Received</p>
                              <p className="text-sm font-semibold" style={{ color: '#16a34a' }}>{fmt(entry.paid_amount)}</p>
                            </div>
                            {entry.tds_amount > 0 && (
                              <div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>TDS Deducted</p>
                                <p className="text-sm font-bold" style={{ color: '#D97706' }}>{fmt(entry.tds_amount)}</p>
                              </div>
                            )}
                            {entry.adjustment_amount > 0 && (
                              <div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Adjustment{entry.adjustment_notes ? ` (${entry.adjustment_notes.slice(0, 20)})` : ''}
                                </p>
                                <p className="text-sm font-semibold" style={{ color: '#6366F1' }}>{fmt(entry.adjustment_amount)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
