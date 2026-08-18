'use client'

// Investments — Opportunities. A short, portfolio-aware list of less-obvious
// NSE/BSE ideas the scanner surfaced (brief §10, §21) — never a hundred-row
// screen. Each carries a thesis, a data-confidence and sources. Analyse turns an
// idea into a full recommendation; watchlist/dismiss curate the list.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radar, Sparkles, Star, X, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'
import RecommendationCard from './RecommendationCard'
import {
  Card, CategoryChip, ConfidenceBar, postJSON, patchJSON, del,
  type OppRow, type RecRow,
} from './shared'

export default function OpportunitiesClient({ opportunities }: { opportunities: OppRow[] }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [discovering, setDiscovering] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [rec, setRec] = useState<RecRow | null>(null)
  const [notice, setNotice] = useState<(AnalyzeIncomplete & { symbol: string }) | null>(null)

  const discover = async () => {
    setDiscovering(true)
    try {
      const r = await postJSON<{ discovered: number; error?: string }>('/api/investments/discover')
      showToast(r.discovered ? `Found ${r.discovered} new idea${r.discovered === 1 ? '' : 's'}` : (r.error ?? 'No new ideas right now'), r.discovered ? 'success' : 'info')
      router.refresh()
    } catch (e) { showToast(e instanceof Error ? e.message : 'Discovery failed', 'error') } finally { setDiscovering(false) }
  }

  const analyze = async (o: OppRow) => {
    setAnalyzingId(o.id); setRec(null); setNotice(null)
    try {
      const r = await postJSON<AnalyzeResponse>('/api/investments/analyze', { symbol: o.symbol, exchange: o.exchange, company_name: o.company_name, is_holding: false })
      if (!r.ok) {
        setNotice({ ...r, symbol: o.symbol })
        showToast(`Could not finish analysing ${o.symbol} — nothing was recorded`, 'info')
        return
      }
      setRec(r.recommendation)
      showToast(`Analysed ${o.symbol}: ${r.recommendation.action.replace(/_/g, ' ')}`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Analysis failed', 'error') } finally { setAnalyzingId(null) }
  }

  const toggleWatch = async (o: OppRow) => {
    try { await patchJSON(`/api/investments/opportunities/${o.id}`, { is_watchlist: !o.is_watchlist }); router.refresh() }
    catch { showToast('Could not update', 'error') }
  }
  const dismiss = async (o: OppRow) => {
    try { await del(`/api/investments/opportunities/${o.id}`); router.refresh() }
    catch { showToast('Could not dismiss', 'error') }
  }

  return (
    <div className="px-4 md:px-8 py-5 max-w-[1200px]">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>Opportunities</h1>
        <button onClick={discover} disabled={discovering} className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--brand)', color: '#fff' }}>
          <Radar className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} /> {discovering ? 'Scanning…' : 'Discover'}
        </button>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--text-muted)' }}>Less-obvious ideas across the market, aware of what you already hold. Ideas, not instructions — analyse before acting.</p>

      {notice && <AnalysisNotice notice={notice} onDismiss={() => setNotice(null)} />}

      {rec && (
        <div className="mb-4">
          <div className="flex justify-end mb-1"><button onClick={() => setRec(null)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--text-faint)' }}><X className="w-3 h-3" /> close</button></div>
          <RecommendationCard rec={rec} />
        </div>
      )}

      {opportunities.length === 0 ? (
        <Card className="p-8 text-center">
          <Radar className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Nothing here yet</p>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>Tap Discover to scan the market for a few interesting ideas.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {opportunities.map(o => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{o.symbol}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>{o.exchange}</span>
                  </div>
                  {o.company_name && <p className="text-[11.5px] truncate" style={{ color: 'var(--text-faint)' }}>{o.company_name}</p>}
                </div>
                <CategoryChip category={o.category} />
              </div>
              {o.thesis && <p className="text-[12.5px] leading-relaxed mt-2" style={{ color: 'var(--text-muted)' }}>{o.thesis}</p>}
              <div className="mt-3"><ConfidenceBar value={o.data_confidence} label="Data confidence" /></div>
              {o.sources?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {o.sources.slice(0, 3).map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                      <ExternalLink className="w-2.5 h-2.5" /><span className="max-w-[140px] truncate">{s.title || s.url}</span>
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => analyze(o)} disabled={analyzingId === o.id} className="flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--brand)', color: '#fff' }}>
                  <Sparkles className={`w-3 h-3 ${analyzingId === o.id ? 'animate-pulse' : ''}`} /> {analyzingId === o.id ? 'Researching…' : 'Analyse'}
                </button>
                <button onClick={() => toggleWatch(o)} className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: o.is_watchlist ? 'var(--amber)' : 'var(--text-muted)' }}>
                  <Star className="w-3 h-3" fill={o.is_watchlist ? 'var(--amber)' : 'none'} /> {o.is_watchlist ? 'Watching' : 'Watch'}
                </button>
                <button onClick={() => dismiss(o)} className="ml-auto text-[11px] font-bold px-2 py-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>Dismiss</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** A 200 response that says the analysis could not finish. Not an error page,
 *  not a verdict — a truthful "this did not complete, and nothing was recorded". */
interface AnalyzeIncomplete {
  ok: false
  status: 'incomplete' | 'failed'
  reason: string
  message: string
  progressSaved: boolean
  note: string
}
type AnalyzeResponse = ({ ok: true; recommendation: RecRow }) | AnalyzeIncomplete

const REASON_LABEL: Record<string, string> = {
  BUDGET_EXHAUSTED: 'the request ran out of time before the analysis finished',
  TIMEOUT: 'the research request timed out',
  RATE_LIMITED: 'the research provider is rate limiting us',
  PROVIDER_ERROR: 'the research provider returned an error',
  AUTHENTICATION_ERROR: 'the research provider rejected our credentials',
  PARSE_ERROR: 'the research came back in an unusable form',
  NO_DATA_FOUND: 'the research returned nothing',
  BAD_REQUEST: 'the research request was rejected',
}

function AnalysisNotice({ notice, onDismiss }: { notice: AnalyzeIncomplete & { symbol: string }; onDismiss: () => void }) {
  return (
    <Card className="p-4 mb-3" style={{ borderColor: 'var(--amber)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold" style={{ color: 'var(--amber)' }}>
            Analysis of {notice.symbol} could not be completed
          </p>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text)' }}>
            Reason: {REASON_LABEL[notice.reason] ?? notice.reason.toLowerCase().replace(/_/g, ' ')}.
          </p>
          <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{notice.note}</p>
          {notice.progressSaved && (
            <p className="text-[12px] mt-1.5 font-bold" style={{ color: 'var(--income)' }}>
              The fundamentals were researched and cached — running Analyse again will finish in about half the time.
            </p>
          )}
        </div>
        <button onClick={onDismiss} className="text-[11px] font-bold shrink-0" style={{ color: 'var(--text-faint)' }}>dismiss</button>
      </div>
    </Card>
  )
}
