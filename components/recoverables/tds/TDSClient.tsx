'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

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

  const pending  = useMemo(() => entries.filter(e => !e.settled),        [entries])
  const settled  = useMemo(() => entries.filter(e => e.settled === true), [entries])
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
    if (!await confirmDialog(`Mark all ${pending.length} pending TDS entries as settled? This is typically done once a year after filing.`)) return
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
      <div className="w-full px-4 md:px-8 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>TDS</h1>
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
            {/* Summary band (spec 9C) */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>PENDING TDS</p>
                <p className="text-[20px] font-extrabold tracking-tight mt-1" style={{ color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>{fmt(pendingTDS)}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{pending.length} entr{pending.length === 1 ? 'y' : 'ies'} · claimable</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>ADJUSTMENTS</p>
                <p className="text-[20px] font-extrabold tracking-tight mt-1" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(pendingAdj)}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>debit notes</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>SETTLED · FY</p>
                <p className="text-[20px] font-extrabold tracking-tight mt-1" style={{ color: 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>{fmt(settledTDS)}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{settled.length} entr{settled.length === 1 ? 'y' : 'ies'} · filed</p>
              </div>
            </div>

            {/* Settle all banner */}
            {pending.length > 0 && (
              <div
                className="rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3"
                style={{ background: 'color-mix(in srgb, var(--amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 25%, transparent)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>
                    {pending.length} pending · {fmt(pendingTDS + pendingAdj)} total
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--amber)' }}>
                    Mark all as settled after filing your annual TDS return.
                  </p>
                </div>
                <button
                  onClick={settleAll}
                  disabled={settlingAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
                  style={{ background: 'var(--amber)', color: '#fff' }}
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
                      ? { background: 'var(--background)', color: 'var(--text)', boxShadow: 'var(--shadow)' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  {t === 'pending' ? `Pending (${pending.length})` : `Settled (${settled.length})`}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-xs font-medium mb-3 px-1" style={{ color: 'var(--expense)' }}>{error}</p>
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
                          <span style={{ color: 'var(--amber)' }}>TDS {fmt(group.tds)}</span>
                        )}
                        {group.adj > 0 && (
                          <span style={{ color: 'var(--brand)' }}>Adj {fmt(group.adj)}</span>
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
                                  background: entry.settled ? 'color-mix(in srgb, var(--income) 10%, transparent)' : 'color-mix(in srgb, var(--amber) 10%, transparent)',
                                  color:      entry.settled ? 'var(--income)' : 'var(--amber)',
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
                                  : { background: 'color-mix(in srgb, var(--income) 10%, transparent)', color: 'var(--income)', border: '1px solid color-mix(in srgb, var(--income) 25%, transparent)' }
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
                              <p className="text-sm font-semibold" style={{ color: 'var(--income)' }}>{fmt(entry.paid_amount)}</p>
                            </div>
                            {entry.tds_amount > 0 && (
                              <div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  TDS Deducted
                                  {entry.invoice_total > 0 && (
                                    <span style={{ color: 'var(--amber)' }}>
                                      {' '}({((entry.tds_amount / entry.invoice_total) * 100).toFixed(1)}%)
                                    </span>
                                  )}
                                </p>
                                <p className="text-sm font-bold" style={{ color: 'var(--amber)' }}>{fmt(entry.tds_amount)}</p>
                              </div>
                            )}
                            {entry.adjustment_amount > 0 && (
                              <div>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Adjustment{entry.adjustment_notes ? ` (${entry.adjustment_notes.slice(0, 20)})` : ''}
                                </p>
                                <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{fmt(entry.adjustment_amount)}</p>
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
