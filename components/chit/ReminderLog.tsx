'use client'

// What was sent, to whom, and what is waiting.
//
// A reminder system you cannot audit is one you stop trusting the first time a
// member says "nobody told me". So every attempt is here, including the ones
// that failed and the ones waiting on a registered number — a log that only
// records successes is the one that cannot answer the question.

import { STEP_LABEL, type StepKind } from '@/lib/chit/reminderSchedule'

export interface LogRow {
  id: string
  member_id: string
  member_name?: string | null
  step_key: string
  kind: StepKind
  channel: string
  status: string
  error: string | null
  sent_at: string
}

const TONE: Record<string, { fg: string; label: string }> = {
  sent:    { fg: 'var(--income)',  label: 'sent' },
  pending: { fg: 'var(--amber, #92400E)', label: 'waiting for a number' },
  failed:  { fg: 'var(--expense)', label: 'failed' },
}

export default function ReminderLog({ rows }: { rows: LogRow[] }) {
  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Messages
        </p>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {(['sent', 'pending', 'failed'] as const)
            .filter(k => counts[k])
            .map(k => `${counts[k]} ${TONE[k].label}`)
            .join(' · ') || 'nothing yet'}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          Nothing has been sent for this group yet. The daily run writes a line here for every message it
          tries, including the ones it cannot send.
        </p>
      ) : rows.map((r, i) => {
        const tone = TONE[r.status] ?? { fg: 'var(--text-muted)', label: r.status }
        return (
          <div key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="min-w-0">
              <p className="text-[12.5px] truncate" style={{ color: 'var(--text)' }}>
                {r.member_name ?? 'Member'} · <span style={{ color: 'var(--text-muted)' }}>{STEP_LABEL[r.kind] ?? r.kind}</span>
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {String(r.sent_at).slice(0, 16).replace('T', ' ')}
                {r.channel === 'link' && ' · by hand'}
              </p>
              {r.error && <p className="text-[11px] mt-0.5" style={{ color: tone.fg }}>{r.error}</p>}
            </div>
            <span className="text-[11px] font-bold shrink-0" style={{ color: tone.fg }}>{tone.label}</span>
          </div>
        )
      })}
    </div>
  )
}
