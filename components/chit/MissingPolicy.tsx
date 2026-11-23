'use client'

// Which details may go out as the word 'missing'.
//
// WHY THE DETAIL AND NOT THE MESSAGE
//
// Whether a gap can be shown to a member is a property of the DETAIL, not of
// the message carrying it. An account number nobody has filled in is either
// something this business is happy to ask for in the open — 'account number:
// missing' is what gets the number out of them — or it is not, and that answer
// does not change between the notice and the reminder.
//
// Everything not switched on here holds the message back instead, which is the
// answer that cannot do harm. A held message keeps its place in the log and
// goes out by itself on the day the detail is filled in.
//
// Only a member's own details are offered. A figure the app works out — an
// amount, a date, a day count — is never offered: if the app cannot work it
// out then the message is wrong, and 'Rs missing is due' is alarming rather
// than helpful.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import {
  ASKABLE_FIELDS, GROUP_LABEL, field, type FieldId, type MissingPolicy as Policy,
} from '@/lib/chit/messageFields'

export default function MissingPolicy({ userId, policy }: {
  userId: string
  policy: Policy
}) {
  const router = useRouter()
  const sb = createClient()
  const [fill, setFill] = useState<Set<FieldId>>(
    new Set((Object.keys(policy ?? {}) as FieldId[]).filter(id => policy[id] === 'fill')))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const specs = ASKABLE_FIELDS.map(id => field(id)!).filter(Boolean)
  const groups = Array.from(new Set(specs.map(s => s.group)))

  function toggle(id: FieldId) {
    setFill(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    const next: Policy = {}
    for (const id of fill) next[id] = 'fill'
    const { error } = await sb.from('chit_settings').upsert({
      user_id: userId,
      missing_policy: next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { notify(error.message, 'error'); return }
    notify('Saved.', 'success')
    setDirty(false)
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <p className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide"
        style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        When a detail is missing
      </p>

      <div className="p-4 space-y-3">
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          A message is held back when something it needs has never been filled in, and it goes
          out by itself on the day you fill it. Pick the details you would rather send as the
          word <b>missing</b> instead — &ldquo;your account number: missing&rdquo; is how you get
          the number out of a member.
        </p>

        {groups.map(g => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] w-24 shrink-0" style={{ color: 'var(--text-faint)' }}>
              {GROUP_LABEL[g]}
            </span>
            {specs.filter(s => s.group === g).map(s => {
              const on = fill.has(s.id)
              return (
                <button key={s.id} type="button" onClick={() => toggle(s.id)}
                  aria-pressed={on}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                  style={on
                    ? { background: 'var(--brand)', color: '#fff', border: '1px solid var(--brand)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {s.label}
                </button>
              )
            })}
          </div>
        ))}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            {fill.size === 0
              ? 'Nothing selected — every message waits for its details.'
              : `${fill.size} will be sent as “missing”. Everything else waits.`}
          </p>
          <button onClick={save} disabled={!dirty || saving}
            className="px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
