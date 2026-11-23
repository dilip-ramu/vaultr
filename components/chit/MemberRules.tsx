'use client'

// The few members who need different handling.
//
// One rule for the business, and an override for the ones who need more
// pushing or less. A member's own schedule REPLACES the business rule rather
// than adding to it — two schedules layered on each other cannot be reasoned
// about at the moment a message goes out at the wrong time, and somebody
// always has to.
//
// Listed across every group, because a member is a person, not a seat: if Ravi
// needs chasing he needs chasing in both his chits.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { DEFAULT_STEPS, PRESETS, type Step } from '@/lib/chit/reminderSchedule'
import { matchStepsToLibrary, type MessageTemplate } from '@/lib/chit/messageTemplates'

export interface MemberRow {
  id: string
  name: string
  phone?: string | null
  reminder_steps?: Step[] | null
}

export default function MemberRules({ members, templates = [] }: {
  members: MemberRow[]
  templates?: MessageTemplate[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [q, setQ] = useState('')

  const overridden = members.filter(m => (m.reminder_steps ?? []).length > 0)
  const shown = useMemo(() => {
    const want = q.trim().toLowerCase()
    const list = want === '' ? members : members.filter(m => m.name.toLowerCase().includes(want))
    // The ones on their own schedule first: those are the ones being managed.
    return [...list].sort((a, b) =>
      Number((b.reminder_steps ?? []).length > 0) - Number((a.reminder_steps ?? []).length > 0)
      || a.name.localeCompare(b.name))
  }, [members, q])

  async function setSteps(m: MemberRow, value: Step[] | null, words: string) {
    const { error } = await sb.from('chit_members').update({ reminder_steps: value }).eq('id', m.id)
    if (error) { notify(error.message, 'error'); return }
    notify(words, 'success')
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Members · {overridden.length} on their own schedule
        </p>
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="find a member"
            className="px-2 py-1 rounded-lg border text-[12.5px] w-40" style={fieldStyle} />
        </div>
      </div>

      {members.length === 0 ? (
        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>No members yet.</p>
      ) : shown.length === 0 ? (
        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>Nobody by that name.</p>
      ) : shown.slice(0, 200).map((m, i) => {
        const own = m.reminder_steps ?? []
        const mode = own.length === 0 ? 'group'
          : own.length === PRESETS.gentle.length && own.every(s => s.kind !== 'reminder') ? 'gentle'
          : own.length > DEFAULT_STEPS.length ? 'persistent' : 'custom'
        return (
          <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="min-w-0">
              <p className="text-[13px] truncate" style={{ color: 'var(--text)' }}>{m.name}</p>
              {!m.phone && (
                <p className="text-[11px]" style={{ color: 'var(--expense)' }}>
                  no phone number — nothing can be sent
                </p>
              )}
            </div>
            <select value={mode}
              onChange={e => {
                const v = e.target.value
                const fitted = (ps: readonly Step[]) => matchStepsToLibrary([...ps], templates)
                if (v === 'group') setSteps(m, null, `${m.name} follows the business rule`)
                else if (v === 'gentle') setSteps(m, fitted(PRESETS.gentle), `${m.name}: notice and dues only`)
                else if (v === 'persistent') setSteps(m, fitted(PRESETS.persistent), `${m.name}: every reminder, plus two`)
              }}
              className="px-2 py-1 rounded-lg border text-[12.5px] shrink-0" style={fieldStyle}>
              <option value="group">follows the business rule</option>
              <option value="gentle">gentle — notice and dues only</option>
              <option value="persistent">persistent — every reminder, plus two</option>
              {mode === 'custom' && <option value="custom">custom</option>}
            </select>
          </div>
        )
      })}

      {shown.length > 200 && (
        <p className="px-4 py-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          Showing the first 200. Use the search.
        </p>
      )}
    </div>
  )
}
