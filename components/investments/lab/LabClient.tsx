'use client'

// Investment Lab — the shell. Owns the paper-money framing, the cycle controls
// and the section tabs; each tab renders its own content.
//
// Two deliberate behaviours:
//   • Opening this page never spends money. Everything on load comes from
//     persisted marks and ledger rows. Research happens only when you press
//     Run Investment Cycle or Run Research Update.
//   • The cycle is autonomous. It is not going to ask you to approve individual
//     trades — that is the point of the experiment. It is also resumable, so a
//     run that stops part-way is continued by the next one rather than restarted.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Play, RefreshCw, Activity, Loader2, ShieldCheck, AlertTriangle, ChevronRight, Stethoscope,
} from 'lucide-react'
import { useToast } from '@/components/shared/Toast'
import { postJSON } from '../shared'
import { Card, CycleStatusChip, inr, fmtDateTime, getJSON, type LabOverview } from './labShared'
import LabOverviewTab from './LabOverviewTab'
import LabPortfolioTab from './LabPortfolioTab'
import LabHistoryTab from './LabHistoryTab'
import LabPerformanceTab from './LabPerformanceTab'

type Tab = 'overview' | 'portfolio' | 'decisions' | 'trades' | 'income' | 'performance'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'trades', label: 'Trades' },
  { id: 'income', label: 'Income' },
  { id: 'performance', label: 'Performance' },
]

interface PreflightCheck { name: string; status: 'ok' | 'warn' | 'fail' | 'skipped'; detail: string }
interface Preflight { ok: boolean; summary: string; checks: PreflightCheck[] }

interface CycleSummary {
  status: string; bought: string[]; sold: string[]; reduced: string[]; added: string[]
  held: string[]; deferred: { symbol: string; reason: string }[]
  analyses: number; actions: number; remaining: number; resumable: boolean; notes: string[]
}

export default function LabClient({ initial }: { initial: LabOverview }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [data, setData] = useState<LabOverview>(initial)
  const [tab, setTab] = useState<Tab>('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<CycleSummary | null>(null)
  const [preflight, setPreflight] = useState<Preflight | null>(null)

  const reload = useCallback(async () => {
    try { setData(await getJSON<LabOverview>('/api/investments/lab/overview')) } catch { /* keep what we have */ }
    router.refresh()
  }, [router])

  const run = async (key: string, fn: () => Promise<string | { message: string; tone: 'success' | 'info' }>) => {
    setBusy(key)
    try {
      const out = await fn()
      const { message, tone } = typeof out === 'string' ? { message: out, tone: 'success' as const } : out
      showToast(message, tone)
      await reload()
    }
    catch (e) { showToast(e instanceof Error ? e.message : 'Something went wrong', 'error') }
    finally { setBusy(null) }
  }

  // ── Not created yet ───────────────────────────────────────────────────────
  if (!data.exists) {
    return (
      <div className="px-4 md:px-8 py-5 max-w-[900px]">
        <Header />
        <Card className="p-6 mt-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--brand)' }} />
            <div>
              <h2 className="text-[16px] font-extrabold" style={{ color: 'var(--text)' }}>Start the experiment</h2>
              <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: 'var(--text-muted)' }}>
                The Investment Lab is a permanent paper portfolio. It starts with <b style={{ color: 'var(--text)' }}>₹10,00,000 of virtual capital</b> and
                invests it using the same research and scoring the Investments hub uses for your real holdings — then measures itself against the Nifty 50 and Nifty 500.
              </p>
              <ul className="mt-3 space-y-1.5">
                {[
                  'No real money is involved and no broker is connected.',
                  'It buys and sells on its own — it will not ask you to approve trades.',
                  'Realistic Indian delivery-equity costs and slippage are applied to every simulated trade.',
                  'Every decision is written to an immutable journal with the reasoning that existed at the time.',
                ].map((x, i) => (
                  <li key={i} className="text-[12.5px] flex gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--income)' }}>✓</span><span>{x}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => run('create', async () => {
                  const r = await postJSON<{ created: boolean; baselinePinned: boolean; warning?: string }>('/api/investments/lab/account')
                  return r.warning
                    ? `Lab created, but the benchmark baseline could not be captured. ${r.warning}`
                    : 'Investment Lab created with ₹10,00,000 of virtual capital'
                })}
                disabled={busy === 'create'}
                className="mt-5 inline-flex items-center gap-2 text-[13px] font-bold px-4 py-2.5 rounded-lg disabled:opacity-60"
                style={{ background: 'var(--brand)', color: '#fff' }}>
                {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Create the Lab with ₹10,00,000 virtual
              </button>
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>
                Creating it is safe to repeat — if a Lab already exists, this returns the existing one.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const s = data.status
  const needsBaseline = !s.baselinePinned

  return (
    <div className="px-4 md:px-8 py-5 max-w-[1200px]">
      <Header />

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mt-4">
        <button
          onClick={() => run('cycle', async () => {
            const r = await postJSON<{ summary: CycleSummary }>('/api/investments/lab/cycle')
            setLastRun(r.summary)
            const acted = r.summary.bought.length + r.summary.sold.length + r.summary.reduced.length + r.summary.added.length
            return r.summary.resumable
              ? { message: `Cycle in progress — ${r.summary.remaining} step${r.summary.remaining === 1 ? '' : 's'} left. Press Resume to continue.`, tone: 'info' as const }
              : { message: `Cycle ${r.summary.status}: ${acted} ${acted === 1 ? 'action' : 'actions'} taken`, tone: 'success' as const }
          })}
          disabled={Boolean(busy) || needsBaseline}
          title={needsBaseline ? 'Establish the benchmark baseline first' : undefined}
          className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--brand)', color: '#fff' }}>
          {busy === 'cycle' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {busy === 'cycle' ? 'Running cycle…' : s.openCycle ? 'Resume Investment Cycle' : 'Run Investment Cycle'}
        </button>

        <button
          onClick={() => run('research', async () => {
            const r = await postJSON<{ summary: { regime: string; regimeRefreshed: boolean; marked: number; navWritten: boolean } }>('/api/investments/lab/research')
            return `Research updated — regime ${r.summary.regime}${r.summary.regimeRefreshed ? ' (refreshed)' : ' (still current)'}, ${r.summary.marked} priced`
          })}
          disabled={Boolean(busy)}
          className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {busy === 'research' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
          Run Research Update
        </button>

        <button
          onClick={() => run('mark', async () => {
            const r = await postJSON<{ navWritten: boolean; quality: string; skippedReason: string | null }>('/api/investments/lab/mark')
            return r.navWritten ? `Marked to market (${r.quality})` : (r.skippedReason ?? 'NAV not recorded')
          })}
          disabled={Boolean(busy)}
          className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {busy === 'mark' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Mark to market
        </button>

        <button
          onClick={() => run('preflight', async () => {
            const r = await postJSON<Preflight>('/api/investments/lab/preflight')
            setPreflight(r)
            return r.summary
          })}
          disabled={Boolean(busy)}
          title="Checks the database schema, the benchmark baseline and the live price feed. Read-only."
          className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {busy === 'preflight' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
          Preflight
        </button>

        {needsBaseline && (
          <button
            onClick={() => run('baseline', async () => {
              await postJSON('/api/investments/lab/account', { op: 'baseline' })
              return 'Benchmark baseline established'
            })}
            disabled={Boolean(busy)}
            className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'color-mix(in srgb, var(--amber) 16%, transparent)', color: 'var(--amber)' }}>
            {busy === 'baseline' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            Establish benchmark baseline
          </button>
        )}
      </div>

      {/* What each control does — the distinction matters */}
      <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        <b style={{ color: 'var(--text-muted)' }}>Investment Cycle</b> researches, decides and executes simulated trades on its own.
        <b style={{ color: 'var(--text-muted)' }}> Research Update</b> refreshes prices, dividends and the market view without trading.
      </p>

      {busy === 'cycle' && (
        <Card className="p-3.5 mt-3">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--brand)' }} />
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Researching and deciding. This can take up to a minute — the cycle stops at its own budget and saves its place, so it is safe to leave it.
            </p>
          </div>
        </Card>
      )}

      {preflight && !busy && <PreflightCard report={preflight} onDismiss={() => setPreflight(null)} />}

      {lastRun && !busy && <RunSummary summary={lastRun} onDismiss={() => setLastRun(null)} />}

      {s.openCycle && !busy && (
        <Card className="p-3.5 mt-3" style={{ borderColor: 'var(--amber)' }}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <CycleStatusChip status={s.openCycle.status} />
            <p className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>
              Cycle in progress — resume to continue.
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Started {fmtDateTime(s.openCycle.started_at)}. It stopped at its time budget rather than being cut off, and picks up at the exact stage it reached — completed research is never repeated.
            </p>
          </div>
          {s.openCycleSteps.length > 0 && (
            <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
              {s.openCycleSteps.map((st, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                    {st.symbol ?? st.kind}
                  </span>
                  <span className="text-[11.5px] text-right" style={{ color: stageColor(st) }}>
                    {stageLabel(st)}
                    {st.attempts > 1 ? ` · attempt ${st.attempts}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Section tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto mt-4 mb-4 pb-0.5" role="tablist">
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
              className="text-[12.5px] font-bold px-3 py-2 rounded-lg whitespace-nowrap transition-colors"
              style={active
                ? { background: 'var(--surface-2)', color: 'var(--text)' }
                : { background: 'transparent', color: 'var(--text-faint)' }}>
              {t.label}
              {t.id === 'decisions' && data.counts.decisions > 0 && <span className="ml-1.5 opacity-60">{data.counts.decisions}</span>}
              {t.id === 'trades' && data.counts.trades > 0 && <span className="ml-1.5 opacity-60">{data.counts.trades}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && <LabOverviewTab data={data} />}
      {tab === 'portfolio' && <LabPortfolioTab data={data} />}
      {tab === 'decisions' && <LabHistoryTab view="decisions" />}
      {tab === 'trades' && <LabHistoryTab view="trades" />}
      {tab === 'income' && <LabHistoryTab view="income" />}
      {tab === 'performance' && <LabPerformanceTab data={data} />}
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--text)' }}>Investment Lab</h1>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full"
            style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 15%, transparent)' }}>
            <ShieldCheck className="w-3 h-3" /> Paper portfolio · ₹10,00,000 virtual
          </span>
        </div>
        <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Can Inex beat the index? A permanent experiment with virtual capital. No real money, no broker connection.
        </p>
      </div>
    </div>
  )
}

function RunSummary({ summary, onDismiss }: { summary: CycleSummary; onDismiss: () => void }) {
  const lines: string[] = []
  if (summary.bought.length) lines.push(`Bought ${summary.bought.join(', ')}`)
  if (summary.added.length) lines.push(`Added to ${summary.added.join(', ')}`)
  if (summary.reduced.length) lines.push(`Reduced ${summary.reduced.join(', ')}`)
  if (summary.sold.length) lines.push(`Exited ${summary.sold.join(', ')}`)
  if (summary.held.length) lines.push(`Held ${summary.held.join(', ')}`)
  if (summary.deferred.length) lines.push(`Deferred ${summary.deferred.map(d => `${d.symbol} (${d.reason})`).join(', ')}`)

  return (
    <Card className="p-4 mt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CycleStatusChip status={summary.status} />
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {summary.analyses} {summary.analyses === 1 ? 'analysis' : 'analyses'} · {summary.actions} {summary.actions === 1 ? 'action' : 'actions'}
              {summary.remaining > 0 ? ` · ${summary.remaining} still queued` : ''}
            </span>
            {summary.resumable && (
              <span className="text-[12px] font-bold" style={{ color: 'var(--amber)' }}>
                Cycle in progress — resume to continue
              </span>
            )}
          </div>
          {lines.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="text-[12.5px] flex gap-2" style={{ color: 'var(--text)' }}>
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />{l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] mt-2" style={{ color: 'var(--text-muted)' }}>
              Nothing cleared the bar this run. Holding cash is a decision, not a failure.
            </p>
          )}
          {summary.notes.slice(0, 4).map((n, i) => (
            <p key={i} className="text-[11.5px] mt-1" style={{ color: 'var(--text-faint)' }}>{n}</p>
          ))}
        </div>
        <button onClick={onDismiss} className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-faint)' }}>dismiss</button>
      </div>
    </Card>
  )
}

const PREFLIGHT_COLOR: Record<string, string> = {
  ok: 'var(--income)', warn: 'var(--amber)', fail: 'var(--expense)', skipped: 'var(--text-faint)',
}

function PreflightCard({ report, onDismiss }: { report: Preflight; onDismiss: () => void }) {
  return (
    <Card className="p-4 mt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold" style={{ color: report.ok ? 'var(--income)' : 'var(--expense)' }}>
            {report.summary}
          </p>
          <div className="mt-2 space-y-1.5">
            {report.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide mt-0.5 shrink-0 w-14 text-right"
                  style={{ color: PREFLIGHT_COLOR[c.status] }}>{c.status}</span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>{c.name}</p>
                  <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onDismiss} className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-faint)' }}>dismiss</button>
      </div>
    </Card>
  )
}

// ── Research stage, in plain language ───────────────────────────────────────
//
// A stage is a statement about what has already SUCCEEDED and been persisted,
// so the label can be trusted. An operational retry is shown as an attempt
// count, never as an investment decision.

type StepView = LabOverview['status']['openCycleSteps'][number]

function stageLabel(st: StepView): string {
  if (st.status === 'done') return 'Decision complete'
  if (st.status === 'skipped') return 'Skipped'
  if (st.status === 'deferred') return 'Deferred'
  if (st.status === 'failed') return 'Research failed'
  switch (st.stage) {
    case 'fundamentals': return 'Researching fundamentals'
    case 'qualitative': return 'Fundamentals complete · researching news'
    case 'decision': return 'Research complete · ready for decision'
    case 'complete': return 'Decision complete'
    default: return 'Queued'
  }
}

function stageColor(st: StepView): string {
  if (st.status === 'done' || st.stage === 'complete') return 'var(--income)'
  if (st.status === 'failed') return 'var(--expense)'
  if (st.stage === 'decision') return 'var(--income)'
  if (st.stage === 'qualitative') return 'var(--amber)'
  return 'var(--text-muted)'
}
