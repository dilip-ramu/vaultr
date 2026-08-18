'use client'

// Investment Lab — Overview. Answers the only question that matters on opening
// the screen: what has Inex done with the virtual ₹10 lakh, and is it beating
// the index? Everything shown here is computed server-side; this file formats.

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { AlertTriangle, Info } from 'lucide-react'
import {
  Card, Stat, SectionTitle, Row, Empty, CycleStatusChip, inr, pct, toneOf,
  fmtDate, fmtDateTime, ago, type LabOverview,
} from './labShared'

export default function LabOverviewTab({ data }: { data: LabOverview }) {
  const t = data.totals
  const b = data.benchmarks
  const s = data.status

  const chartData = data.navHistory.map(n => ({
    label: fmtDate(n.as_of),
    Lab: n.total_value,
    'Nifty 50': n.nifty50_value,
    'Nifty 500': n.nifty500_value,
  }))

  return (
    <div className="space-y-4">
      {/* ── What happened to the money ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Portfolio value" value={inr(t.portfolioValue)}
          sub={`from ${inr(t.startingCapital)} start`} />
        <Stat label="Total return" value={inr(t.totalReturn)}
          sub={pct(t.totalReturnPct)} tone={toneOf(t.totalReturn)} />
        <Stat label="Cash" value={inr(t.cash)}
          sub={t.cashPct != null ? `${t.cashPct.toFixed(1)}% of portfolio` : undefined} />
        <Stat label="Invested" value={inr(t.investedValue)}
          sub={`${s.holdingsCount} ${s.holdingsCount === 1 ? 'holding' : 'holdings'}`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Realised P&L" value={inr(t.realizedPnl)} tone={toneOf(t.realizedPnl)}
          hint="Profit or loss booked on positions the Lab has closed." />
        <Stat label="Unrealised P&L" value={inr(t.unrealizedPnl)} tone={toneOf(t.unrealizedPnl)}
          hint="Mark-to-market on positions still held." />
        <Stat label="Dividends" value={inr(t.dividends)}
          tone={t.dividends > 0 ? 'var(--income)' : undefined}
          hint="Credited to virtual cash, so already inside portfolio value." />
        <Stat label="Cost basis" value={inr(t.costBasis)}
          hint="What the Lab paid for the positions it still holds, including costs." />
      </div>

      {/* ── Warnings ─────────────────────────────────────────────────────── */}
      {s.warnings.length > 0 && (
        <Card className="p-3.5">
          <div className="space-y-1.5">
            {s.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--amber)' }} />
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{w}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Benchmark comparison ─────────────────────────────────────────── */}
      <Card className="p-4">
        <SectionTitle right={b.asOf ? <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>as of {fmtDate(b.asOf)}</span> : undefined}>
          Versus the index
        </SectionTitle>

        {!b.sufficient ? (
          <div className="flex items-start gap-2 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{b.note}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    <th className="text-left font-bold pb-2">&nbsp;</th>
                    <th className="text-right font-bold pb-2">Started at</th>
                    <th className="text-right font-bold pb-2">Now worth</th>
                    <th className="text-right font-bold pb-2">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map(l => (
                    <tr key={l.label} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 font-extrabold" style={{ color: l.label === 'Inex Lab' ? 'var(--brand)' : 'var(--text)' }}>{l.label}</td>
                      <td className="py-2 text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{inr(l.start)}</td>
                      <td className="py-2 text-right font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(l.current)}</td>
                      <td className="py-2 text-right font-extrabold" style={{ color: toneOf(l.returnPct), fontVariantNumeric: 'tabular-nums' }}>{pct(l.returnPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(b.alphaNifty50 != null || b.alphaNifty500 != null) ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                {b.alphaNifty50 != null && (
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    vs Nifty 50: <b style={{ color: toneOf(b.alphaNifty50) }}>{pct(b.alphaNifty50)}</b>
                  </span>
                )}
                {b.alphaNifty500 != null && (
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    vs Nifty 500: <b style={{ color: toneOf(b.alphaNifty500) }}>{pct(b.alphaNifty500)}</b>
                  </span>
                )}
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {data.metrics?.benchmarkBasis ?? 'total-return basis'}
                </span>
              </div>
            ) : (
              <p className="text-[11.5px] mt-3" style={{ color: 'var(--text-faint)' }}>
                Alpha needs at least two recorded sessions before it means anything.
              </p>
            )}
          </>
        )}
      </Card>

      {/* ── Value over time ──────────────────────────────────────────────── */}
      <Card className="p-4">
        <SectionTitle right={<span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{data.history.observations} {data.history.observations === 1 ? 'session' : 'sessions'}</span>}>
          Portfolio value over time
        </SectionTitle>
        {data.history.chartReady ? (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gLab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={64}
                domain={['auto', 'auto']} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
                formatter={(v: number | null) => [v == null ? 'no data' : inr(v), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Lab" stroke="var(--brand)" strokeWidth={2} fill="url(#gLab)" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="Nifty 50" stroke="var(--text-faint)" strokeWidth={1.5} fill="transparent" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="Nifty 500" stroke="var(--transfer)" strokeWidth={1.5} strokeDasharray="4 3" fill="transparent" dot={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center px-6">
            <p className="text-[12.5px] text-center leading-relaxed" style={{ color: 'var(--text-muted)' }}>{data.history.note}</p>
          </div>
        )}
      </Card>

      {/* ── Status detail ────────────────────────────────────────────────── */}
      <Card className="p-4">
        <SectionTitle>Lab status</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <Row label="Cycle" value={s.openCycle
              ? <span className="inline-flex items-center gap-1.5"><CycleStatusChip status={s.openCycle.status} /> resumes on next run</span>
              : s.lastCycle ? <CycleStatusChip status={s.lastCycle.status} /> : 'never run'} />
            <Row label="Last cycle started" value={fmtDateTime(s.lastCycleAt)} />
            <Row label="Last research update" value={fmtDateTime(s.lastResearchAt)} />
            <Row label="Model version" value={data.lab?.modelVersion ?? '—'} />
          </div>
          <div>
            <Row label="Last market mark" value={s.lastMark ? `${fmtDate(s.lastMark.as_of)} · ${ago(s.lastMark.ageHours)}` : 'never marked'} />
            <Row label="Mark quality" value={s.lastMark?.data_quality ?? '—'}
              tone={s.lastMark?.data_quality === 'stale' ? 'var(--amber)' : undefined} />
            <Row label="Benchmark baseline" value={s.baselinePinned ? `pinned ${fmtDate(s.baselineAsOf)}` : 'not established'}
              tone={s.baselinePinned ? undefined : 'var(--expense)'} />
            <Row label="Started" value={fmtDate(data.lab?.startDate ?? null)} />
          </div>
        </div>
      </Card>

      {data.counts.decisions === 0 && (
        <Empty
          title="No decisions yet"
          body="The Lab has not made an investment decision. Run an Investment Cycle to have it research the market, size positions inside its own rules, and record what it did and why." />
      )}
    </div>
  )
}
