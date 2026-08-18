'use client'

// Why the Lab owns this. A side panel over the stored decision record — nothing
// here is generated on open, and any field the Lab never recorded is shown as
// missing rather than filled in with something plausible.

import { useEffect, useState } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { ActionChip, ConfidenceBar } from '../shared'
import {
  Card, SectionTitle, Row, KindChip, inr, inr2, pct, toneOf, fmtDateTime, getJSON,
  type DecisionRow, type TradeRow, type LabPositionView,
} from './labShared'
import type { RecAction } from '@/lib/investments/types'

interface Payload { thesis: DecisionRow | null; history: DecisionRow[]; trades: TradeRow[] }

export default function ThesisPanel({ symbol, exchange, companyName, position, onClose }: {
  symbol: string
  exchange: string
  companyName: string | null
  position?: LabPositionView
  onClose: () => void
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getJSON<Payload>(`/api/investments/lab/thesis?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`)
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load the thesis') })
    return () => { alive = false }
  }, [symbol, exchange])

  const t = data?.thesis ?? null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="h-full w-full sm:max-w-[560px] overflow-y-auto"
        style={{ background: 'var(--bg, var(--surface))', borderLeft: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 flex items-start justify-between gap-3"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-extrabold truncate" style={{ color: 'var(--text)' }}>{symbol}</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>{exchange}</span>
              {t?.action && <ActionChip action={t.action as RecAction} />}
            </div>
            <p className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>{companyName || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg shrink-0" style={{ background: 'var(--surface-2)' }} aria-label="Close">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {position && (
            <Card className="p-3.5">
              <SectionTitle>Position</SectionTitle>
              <Row label="Quantity" value={position.quantity} />
              <Row label="Average cost" value={inr2(position.avgCost)} />
              <Row label="Last price" value={inr2(position.price)} />
              <Row label="Market value" value={inr(position.marketValue)} />
              <Row label="Weight" value={position.weightPct != null ? `${position.weightPct.toFixed(1)}%` : '—'} />
              <Row label="Unrealised P&L" value={`${inr(position.unrealizedPnl)} · ${pct(position.returnPct)}`} tone={toneOf(position.unrealizedPnl)} />
            </Card>
          )}

          {!data && !error && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
            </div>
          )}
          {error && <p className="text-[12.5px]" style={{ color: 'var(--expense)' }}>{error}</p>}

          {data && !t && (
            <Card className="p-5 text-center">
              <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>No recorded thesis</p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                The Lab has not completed an analysis of {symbol} yet, so there is nothing to show. It will be written the next time a cycle evaluates this name.
              </p>
            </Card>
          )}

          {t && (
            <>
              <Card className="p-4">
                <SectionTitle right={<span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtDateTime(t.ts)}</span>}>
                  Why the Lab holds this
                </SectionTitle>
                {t.reason && <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{t.reason}</p>}
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <ConfidenceBar value={t.ai_confidence} label="AI confidence" />
                  <ConfidenceBar value={t.data_confidence} label="Data confidence" />
                </div>
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <Row label="Fair value" value={t.fair_value_low != null || t.fair_value_high != null ? `${inr2(t.fair_value_low)} – ${inr2(t.fair_value_high)}` : 'not recorded'} />
                  <Row label="Entry range" value={t.entry_low != null || t.entry_high != null ? `${inr2(t.entry_low)} – ${inr2(t.entry_high)}` : 'not recorded'} />
                  <Row label="Horizon" value={t.horizon || 'not recorded'} />
                  <Row label="Market regime then" value={t.market_regime || 'not recorded'} />
                  <Row label="Model version" value={t.model_version} />
                </div>
              </Card>

              <CaseCard title="Bull case" body={t.bull_case} color="var(--income)" />
              <CaseCard title="Base case" body={t.base_case} color="var(--text-muted)" />
              <CaseCard title="Bear case" body={t.bear_case} color="var(--expense)" />

              <ListCard title="Risks" items={t.risks} />
              <ListCard title="What would break the thesis" items={t.invalidation} />

              {t.sources?.length > 0 && (
                <Card className="p-4">
                  <SectionTitle>Sources</SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {t.sources.slice(0, 12).map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-1 rounded"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span className="max-w-[180px] truncate">{s.title || s.url}</span>
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {data && data.trades.length > 0 && (
            <Card className="p-4">
              <SectionTitle>Trades in this name</SectionTitle>
              <div className="space-y-2">
                {data.trades.map(tr => (
                  <div key={tr.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span style={{ color: 'var(--text-muted)' }}>{fmtDateTime(tr.ts)}</span>
                    <span className="font-bold" style={{ color: tr.side === 'buy' ? 'var(--income)' : 'var(--expense)' }}>
                      {tr.side === 'buy' ? 'Bought' : 'Sold'} {tr.quantity} @ {inr2(tr.price)}
                    </span>
                    <span style={{ color: toneOf(tr.realized_pnl), fontVariantNumeric: 'tabular-nums' }}>
                      {tr.realized_pnl != null ? inr(tr.realized_pnl) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data && data.history.length > 1 && (
            <Card className="p-4">
              <SectionTitle>Decision history for {symbol}</SectionTitle>
              <div className="space-y-2">
                {data.history.map(d => (
                  <div key={d.id} className="flex items-start gap-2.5 text-[12px]">
                    <KindChip kind={d.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ color: 'var(--text-muted)' }}>{d.reason || '—'}</p>
                      <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{fmtDateTime(d.ts)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function CaseCard({ title, body, color }: { title: string; body: string | null; color: string }) {
  if (!body) return null
  return (
    <Card className="p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color }}>{title}</p>
      <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text)' }}>{body}</p>
    </Card>
  )
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <Card className="p-4">
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((x, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed flex gap-2" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--text-faint)' }}>•</span><span>{x}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
