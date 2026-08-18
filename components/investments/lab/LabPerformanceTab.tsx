'use client'

// Investment Lab — Performance. Uses the deterministic metrics module; every
// figure that needs more history than exists is shown as unavailable with the
// reason, rather than as a number that would be technically computable and
// practically meaningless.

import { Info } from 'lucide-react'
import { Card, SectionTitle, Row, inr, pct, toneOf, type LabOverview } from './labShared'

const n2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v.toFixed(2))

export default function LabPerformanceTab({ data }: { data: LabOverview }) {
  const m = data.metrics
  const h = data.history

  const RATIO_REASON = `Needs about 20 trading sessions of history — ${h.observations} recorded so far.`
  const CAGR_REASON = 'Needs at least three months of history to annualise honestly.'

  return (
    <div className="space-y-4">
      <Card className="p-3.5">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{h.note}</p>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>Return</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <Metric label="Total return" value={m?.totalReturnPct != null ? pct(m.totalReturnPct) : null}
              tone={toneOf(m?.totalReturnPct)} reason="No market marks recorded yet." />
            <Metric label="of which dividends" value={m?.dividendReturnPct != null ? pct(m.dividendReturnPct) : null}
              reason="No dividends received yet." />
            <Metric label="of which price" value={m?.priceReturnPct != null ? pct(m.priceReturnPct) : null}
              reason="Available once dividends have been recorded." />
          </div>
          <div>
            <Metric label="CAGR" value={h.cagrReady && m?.cagrPct != null ? pct(m.cagrPct) : null}
              tone={toneOf(m?.cagrPct)} reason={CAGR_REASON} />
            <Metric label="Alpha vs Nifty 50" value={m?.alphaNifty50Pct != null ? pct(m.alphaNifty50Pct) : null}
              tone={toneOf(m?.alphaNifty50Pct)} reason="Needs a pinned baseline and at least two sessions." />
            <Metric label="Alpha vs Nifty 500" value={m?.alphaNifty500Pct != null ? pct(m.alphaNifty500Pct) : null}
              tone={toneOf(m?.alphaNifty500Pct)} reason="Needs a pinned baseline and at least two sessions." />
          </div>
        </div>
        {m && (
          <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
            Alpha is measured on a {m.benchmarkBasis}: the Lab's return includes dividends, so the index is adjusted for an assumed yield rather than compared on price alone.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>Risk</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <Metric label="Volatility (annualised)" value={h.ratiosReady && m?.volatilityPct != null ? `${m.volatilityPct.toFixed(2)}%` : null} reason={RATIO_REASON} />
            <Metric label="Maximum drawdown" value={m?.maxDrawdownPct != null ? `${m.maxDrawdownPct.toFixed(2)}%` : null}
              tone={m?.maxDrawdownPct ? 'var(--expense)' : undefined} reason="Needs at least two sessions." />
          </div>
          <div>
            <Metric label="Sharpe" value={h.ratiosReady ? n2(m?.sharpe) : null} reason={RATIO_REASON} />
            <Metric label="Sortino" value={h.ratiosReady ? n2(m?.sortino) : null} reason={RATIO_REASON} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>Decisions and trading</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <Metric label="Closed positions" value={m?.closedCount != null ? String(m.closedCount) : '0'} />
            <Metric label="Win rate" value={m?.winRatePct != null ? `${m.winRatePct.toFixed(0)}%` : null}
              reason="Needs at least one closed position." />
            <Metric label="Profit factor" value={m?.profitFactor != null && Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : null}
              reason="Needs at least one winning and one losing close." />
          </div>
          <div>
            <Metric label="Average win" value={m?.avgWin != null ? inr(m.avgWin) : null} tone="var(--income)" reason="Needs a profitable close." />
            <Metric label="Average loss" value={m?.avgLoss != null ? inr(m.avgLoss) : null} tone="var(--expense)" reason="Needs a losing close." />
            <Metric label="Turnover" value={m?.turnoverPct != null ? `${m.turnoverPct.toFixed(1)}%` : null} reason="Needs at least one trade." />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>Data quality</SectionTitle>
        <Row label="Sessions recorded" value={String(h.observations)} />
        <Row label="Sessions using a carried-forward price" value={m?.staleObservations != null ? String(m.staleObservations) : '0'}
          tone={m?.staleObservations ? 'var(--amber)' : undefined} />
        <Row label="Rows excluded as untrustworthy" value={m?.droppedObservations != null ? String(m.droppedObservations) : '0'} />
        <Row label="Cash held" value={m?.cashPct != null ? `${m.cashPct.toFixed(1)}%` : '—'} />
      </Card>
    </div>
  )
}

function Metric({ label, value, tone, reason }: { label: string; value: string | null; tone?: string; reason?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {value != null ? (
        <span className="text-[12.5px] font-bold" style={{ color: tone ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      ) : (
        <span className="text-[11.5px] text-right max-w-[220px]" style={{ color: 'var(--text-faint)' }} title={reason}>
          not yet meaningful
        </span>
      )}
    </div>
  )
}
