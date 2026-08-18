'use client'

// The full recommendation surface (brief §11, §12, §13, §14). Everything the
// system knows about one call, laid out honestly: the action, why now (or why to
// wait), the three cases, the numbers, what would change its mind, how confident
// it is and why, the transparent score, and the sources. The final line is a
// standing reminder that the user decides — nothing here executes a trade.

import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import {
  ActionChip, ConfidenceBar, Card, inr2, type RecRow,
} from './shared'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>{title}</p>
      {children}
    </div>
  )
}

function Bullets({ items, tone }: { items: string[]; tone?: 'good' | 'bad' }) {
  if (!items?.length) return <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>—</p>
  const dot = tone === 'good' ? 'var(--income)' : tone === 'bad' ? 'var(--expense)' : 'var(--text-faint)'
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export default function RecommendationCard({ rec }: { rec: RecRow }) {
  const [showScore, setShowScore] = useState(false)
  const factors = rec.score_breakdown && 'factors' in rec.score_breakdown ? rec.score_breakdown.factors : {}
  const range = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${inr2(lo)} – ${inr2(hi)}` : lo != null ? `from ${inr2(lo)}` : hi != null ? `up to ${inr2(hi)}` : '—'

  return (
    <Card className="p-4 md:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[17px] font-extrabold" style={{ color: 'var(--text)' }}>{rec.symbol}</h3>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>{rec.exchange}</span>
            <ActionChip action={rec.action} />
          </div>
          {rec.company_name && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{rec.company_name}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Price</p>
          <p className="text-[17px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr2(rec.current_price)}</p>
        </div>
      </div>

      {/* Why now / wait + portfolio context */}
      {rec.why_now && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Why now</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{rec.why_now}</p>
        </div>
      )}
      {rec.portfolio_context && (
        <div className="mt-2 rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--amber) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 25%, transparent)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--amber)' }}>Portfolio view</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{rec.portfolio_context}</p>
        </div>
      )}

      {/* Numbers strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        {[
          { k: 'Entry range', v: range(rec.entry_low, rec.entry_high) },
          { k: 'Fair value', v: range(rec.fair_value_low, rec.fair_value_high) },
          { k: 'Horizon', v: rec.horizon || '—' },
          { k: 'Max allocation', v: rec.max_alloc_pct != null ? `${rec.max_alloc_pct}%` : '—' },
        ].map(x => (
          <div key={x.k} className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{x.k}</p>
            <p className="text-[13px] font-extrabold mt-0.5" style={{ color: 'var(--text)' }}>{x.v}</p>
          </div>
        ))}
      </div>

      {/* Confidences */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <ConfidenceBar value={rec.data_confidence} label="Data confidence" />
        <ConfidenceBar value={rec.ai_confidence} label="AI confidence" />
      </div>

      {/* Cases */}
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <Section title="Bull case"><p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{rec.bull_case || '—'}</p></Section>
        <Section title="Base case"><p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{rec.base_case || '—'}</p></Section>
        <Section title="Bear case"><p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{rec.bear_case || '—'}</p></Section>
      </div>

      {/* Catalysts / risks / invalidation */}
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <Section title="Catalysts"><Bullets items={rec.catalysts} tone="good" /></Section>
        <Section title="Risks"><Bullets items={rec.risks} tone="bad" /></Section>
        <Section title="What would change its mind"><Bullets items={rec.invalidation} /></Section>
      </div>

      {/* Score breakdown (collapsible, transparent) */}
      {Object.keys(factors).length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowScore(s => !s)} className="flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color: 'var(--text-muted)' }}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showScore ? 'rotate-180' : ''}`} />
            Score {rec.total_score != null ? `${rec.total_score}/100` : ''} · how it was built
          </button>
          {showScore && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
              {Object.entries(factors).map(([k, f]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[11px] w-40 shrink-0" style={{ color: 'var(--text-muted)' }}>{k.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: 'var(--brand)' }} />
                  </div>
                  <span className="text-[11px] font-bold w-9 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{f.score}</span>
                  <span className="text-[10px] w-10 text-right" style={{ color: 'var(--text-faint)' }}>×{f.weight}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      {rec.sources?.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {rec.sources.slice(0, 10).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <ExternalLink className="w-3 h-3" />
                <span className="max-w-[220px] truncate">{s.title || s.url}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] mt-4 pt-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
        Decision support only — you approve every action. Not investment advice; the system can be wrong and says so via its confidence scores.
      </p>
    </Card>
  )
}
