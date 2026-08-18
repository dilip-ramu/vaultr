'use client'

// Shared building blocks for the Investments hub — chips, meters, row types and
// tiny fetch helpers. Everything here is presentation only and uses the app's
// CSS-variable tokens so it matches Vaultr in light and dark.

import type {
  RecAction, RegimeState, ThesisStatus, OppCategory, ScoreBreakdown, Source,
} from '@/lib/investments/types'
import { REC_LABEL, REGIME_LABEL } from '@/lib/investments/types'
import type { PortfolioSummary } from '@/lib/investments/portfolio'

// ── Row shapes (mirror the v109 tables) ─────────────────────────────────────
export interface HoldingRow {
  id: string; symbol: string; exchange: string; company_name: string | null
  quantity: number; avg_cost: number; last_price: number | null; last_price_at: string | null
  sector: string | null; market_cap_band: string | null
  thesis: string | null; ai_rating: RecAction | null; thesis_status: ThesisStatus
  max_alloc_pct: number | null; source: string; asset_id: string | null
  notes: string | null; created_at: string; updated_at: string
}
export interface RecRow {
  id: string; symbol: string; exchange: string; company_name: string | null
  as_of: string; action: RecAction; current_price: number | null
  entry_low: number | null; entry_high: number | null
  fair_value_low: number | null; fair_value_high: number | null
  bull_case: string | null; base_case: string | null; bear_case: string | null
  horizon: string | null; why_now: string | null
  catalysts: string[]; risks: string[]; invalidation: string[]
  data_confidence: number | null; ai_confidence: number | null; max_alloc_pct: number | null
  market_regime: string | null; total_score: number | null
  score_breakdown: ScoreBreakdown | Record<string, never>; portfolio_context: string | null
  sources: Source[]; is_holding: boolean; created_at: string
}
export interface OppRow {
  id: string; symbol: string; exchange: string; company_name: string | null
  category: OppCategory; thesis: string | null; data_confidence: number | null
  score: number | null; sources: Source[]; is_watchlist: boolean; dismissed: boolean; created_at: string
}
export interface RegimeRow {
  id: string; as_of: string; state: RegimeState; summary: string | null
  reasons: string[]; drivers: Record<string, string>; sources: Source[]; created_at: string
}
export interface AlertRow {
  id: string; symbol: string | null; kind: string; severity: string
  title: string; body: string | null; is_read: boolean; created_at: string
}
export type { PortfolioSummary }

// ── Colour maps ─────────────────────────────────────────────────────────────
const BUYISH: RecAction[] = ['STRONG_BUY', 'BUY', 'ACCUMULATE']
const SELLISH: RecAction[] = ['REDUCE', 'SELL', 'AVOID']
export function actionColor(a: RecAction): string {
  if (BUYISH.includes(a)) return 'var(--income)'
  if (SELLISH.includes(a)) return 'var(--expense)'
  if (a === 'HOLD') return 'var(--amber)'
  return 'var(--text-faint)'   // INSUFFICIENT_DATA
}
const THESIS_COLOR: Record<ThesisStatus, string> = {
  intact: 'var(--income)', watch: 'var(--amber)',
  deteriorating: 'var(--expense)', invalidated: 'var(--expense)',
}
const THESIS_LABEL: Record<ThesisStatus, string> = {
  intact: 'Thesis intact', watch: 'Watch', deteriorating: 'Deteriorating', invalidated: 'Invalidated',
}
const REGIME_COLOR: Record<RegimeState, string> = {
  risk_on: 'var(--income)', neutral: 'var(--transfer)', cautious: 'var(--amber)',
  risk_off: 'var(--expense)', crisis: 'var(--expense)',
}
const CAT_LABEL: Record<OppCategory, string> = {
  strong_buy: 'Strong Buy', buy: 'Buy', accumulate: 'Accumulate', watch: 'Watch',
  deep_value: 'Deep Value', growth: 'Growth', turnaround: 'Turnaround',
  special_situation: 'Special Situation', ipo: 'IPO', avoid: 'Avoid',
}

// ── Pills ────────────────────────────────────────────────────────────────────
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {label}
    </span>
  )
}
export function ActionChip({ action }: { action: RecAction }) {
  return <Pill label={REC_LABEL[action]} color={actionColor(action)} />
}
export function ThesisChip({ status }: { status: ThesisStatus }) {
  return <Pill label={THESIS_LABEL[status]} color={THESIS_COLOR[status]} />
}
export function RegimePill({ state }: { state: RegimeState }) {
  return <Pill label={REGIME_LABEL[state]} color={REGIME_COLOR[state]} />
}
export function CategoryChip({ category }: { category: OppCategory }) {
  const color = actionColor((category === 'avoid' ? 'AVOID' : category === 'watch' ? 'HOLD' : 'BUY'))
  return <Pill label={CAT_LABEL[category]} color={color} />
}

// ── Confidence meter (0–100) ─────────────────────────────────────────────────
export function ConfidenceBar({ value, label }: { value: number | null; label: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  const color = v >= 70 ? 'var(--income)' : v >= 45 ? 'var(--amber)' : 'var(--expense)'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-[11px] font-extrabold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
          {value == null ? '—' : `${Math.round(v)}/100`}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Formatting ────────────────────────────────────────────────────────────────
export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
export function inr2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
/** "priced 3h ago" / "never priced" — staleness must be visible (§ house rule). */
export function priceAge(at: string | null): { text: string; stale: boolean } {
  if (!at) return { text: 'never priced', stale: true }
  const hrs = (Date.now() - new Date(at).getTime()) / 3_600_000
  const stale = hrs > 24
  if (hrs < 1) return { text: 'priced just now', stale }
  if (hrs < 24) return { text: `priced ${Math.round(hrs)}h ago`, stale }
  return { text: `priced ${Math.round(hrs / 24)}d ago`, stale }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
export async function postJSON<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`)
  return json as T
}
export async function patchJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`)
  return json as T
}
export async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

// Card shell used across the hub.
export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', ...style }}>
      {children}
    </div>
  )
}

export const CATEGORY_LABEL = CAT_LABEL
