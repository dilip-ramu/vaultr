'use client'

// Investments — Journal. The immutable decision record (brief §23–25). Every
// recommendation ever made, newest first, never rewritten. Expand any row to see
// the full call as it was made at the time.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import RecommendationCard from './RecommendationCard'
import { Card, ActionChip, type RecRow } from './shared'

export default function JournalClient({ recs }: { recs: RecRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const fmt = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 md:px-8 py-5 max-w-[1000px]">
      <h1 className="text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>Journal</h1>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--text-muted)' }}>Every recommendation, as it was made — never edited after the fact.</p>

      {recs.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No recommendations yet. Analyse a holding or an opportunity to start the record.</p></Card>
      ) : (
        <div className="space-y-2">
          {recs.map(r => (
            <Card key={r.id} className="overflow-hidden">
              <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="text-[13px] font-extrabold w-24 shrink-0" style={{ color: 'var(--text)' }}>{r.symbol}</span>
                <ActionChip action={r.action} />
                <span className="text-[12px] flex-1 truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>{r.why_now || r.base_case || ''}</span>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-faint)' }}>{fmt(r.created_at)}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openId === r.id ? 'rotate-180' : ''}`} style={{ color: 'var(--text-faint)' }} />
              </button>
              {openId === r.id && <div className="px-3 pb-3"><RecommendationCard rec={r} /></div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
