'use client'

// Shared presentation pieces for the Investment Lab. Everything reuses the
// Investments hub's existing tokens and components (components/investments/
// shared.tsx) so the Lab looks like the rest of Inex rather than a bolt-on.

import type { LabOverview, LabPositionView } from '@/lib/investments/lab/overview'
import { Card, inr, inr2, pct } from '../shared'

export type { LabOverview, LabPositionView }
export { Card, inr, inr2, pct }

export interface DecisionRow {
  id: string; ts: string; kind: string
  symbol: string | null; exchange: string | null; company_name: string | null
  action: string | null; quantity: number | null; price: number | null
  capital_deployed: number | null; portfolio_weight: number | null
  reason: string | null; thesis: string | null
  bull_case: string | null; base_case: string | null; bear_case: string | null
  horizon: string | null; fair_value_low: number | null; fair_value_high: number | null
  entry_low: number | null; entry_high: number | null
  risks: string[]; invalidation: string[]
  ai_confidence: number | null; data_confidence: number | null
  market_regime: string | null; sources: { title?: string; url: string }[]
  score_breakdown: Record<string, unknown>
  realized_pnl: number | null; thesis_invalidated: boolean | null
  snapshot: Record<string, unknown>; model_version: string
}

export interface TradeRow {
  id: string; ts: string; side: 'buy' | 'sell'
  symbol: string; exchange: string; quantity: number; price: number
  gross_amount: number; costs_total: number
  costs_breakdown: Record<string, number>
  cash_after: number; realized_pnl: number | null; model_version: string
}

export interface DividendRow {
  id: string; symbol: string; exchange: string
  dividend_per_share: number; shares_on_record: number
  gross_dividend: number; tax_pct: number; net_dividend: number
  ex_date: string | null; record_date: string | null; payment_date: string | null
  kind: string; processed_at: string | null
}

export interface CorporateActionRow {
  id: string; symbol: string; exchange: string; type: string
  ratio: number | null; ex_date: string | null; details: string | null
  status: string; applied_at: string | null
}

// ── Formatting ──────────────────────────────────────────────────────────────

export const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
export const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d.length === 10 ? `${d}T00:00:00Z` : d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
export const ago = (hours: number | null) => {
  if (hours == null) return 'never'
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}
export const toneOf = (n: number | null | undefined) =>
  n == null ? 'var(--text-faint)' : n > 0 ? 'var(--income)' : n < 0 ? 'var(--expense)' : 'var(--text-muted)'

// ── Small building blocks ───────────────────────────────────────────────────

export function Stat({ label, value, sub, tone, hint }: {
  label: string; value: string; sub?: string; tone?: string; hint?: string
}) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} title={hint}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-[19px] font-extrabold mt-1" style={{ color: tone ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className="text-[11px] font-bold mt-0.5" style={{ color: tone ?? 'var(--text-faint)' }}>{sub}</p>}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>{children}</p>
      {right}
    </div>
  )
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
      <p className="text-[12.5px] mt-1 max-w-[520px] mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>{body}</p>
    </Card>
  )
}

export function Badge({ label, color, subtle }: { label: string; color: string; subtle?: boolean }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
      style={{ color, background: subtle ? 'transparent' : `color-mix(in srgb, ${color} 14%, transparent)`, border: subtle ? `1px solid ${color}` : 'none' }}>
      {label}
    </span>
  )
}

const CYCLE_COLOR: Record<string, string> = {
  started: 'var(--transfer)', in_progress: 'var(--amber)', partial: 'var(--amber)',
  completed: 'var(--income)', failed: 'var(--expense)',
}
const CYCLE_LABEL: Record<string, string> = {
  started: 'Started', in_progress: 'In progress', partial: 'Partly completed',
  completed: 'Completed', failed: 'Failed',
}
export function CycleStatusChip({ status }: { status: string }) {
  return <Badge label={CYCLE_LABEL[status] ?? status} color={CYCLE_COLOR[status] ?? 'var(--text-faint)'} />
}

const KIND_COLOR: Record<string, string> = {
  buy: 'var(--income)', add: 'var(--income)', hold: 'var(--amber)', watch: 'var(--transfer)',
  reduce: 'var(--expense)', exit: 'var(--expense)', sell: 'var(--expense)',
  deferred: 'var(--text-faint)', cycle: 'var(--transfer)', research: 'var(--transfer)',
}
const KIND_LABEL: Record<string, string> = {
  buy: 'Buy', add: 'Add', hold: 'Hold', watch: 'Watch', reduce: 'Reduce',
  exit: 'Sell', sell: 'Sell', deferred: 'Deferred', cycle: 'Cycle', research: 'Research',
}
export function KindChip({ kind }: { kind: string }) {
  return <Badge label={KIND_LABEL[kind] ?? kind} color={KIND_COLOR[kind] ?? 'var(--text-faint)'} />
}

/** Staleness must always be visible — a confidently-shown old price is worse
 *  than an obviously old one. */
export function PriceAge({ hours, stale }: { hours: number | null; stale: boolean }) {
  if (hours == null) return <span className="text-[10.5px]" style={{ color: 'var(--expense)' }}>never priced</span>
  return (
    <span className="text-[10.5px]" style={{ color: stale ? 'var(--amber)' : 'var(--text-faint)' }}>
      {stale ? 'stale · ' : ''}{ago(hours)}
    </span>
  )
}

export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[12.5px] font-bold text-right" style={{ color: tone ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`)
  return json as T
}
