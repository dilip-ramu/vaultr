'use client'

// The six messages, and when each one goes out.
//
// The group carries the schedule. A member may carry their own, which REPLACES
// the group's rather than merging with it — two schedules layered on each
// other cannot be reasoned about at the moment a message goes out at the wrong
// time, and somebody always has to.
//
// Nothing here decides who gets what: that is lib/chit/reminderSchedule.ts,
// which is pure and tested. This screen edits the numbers and shows the
// timetable they produce, so a mistake is visible as a date rather than as a
// surprise next month.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import {
  DEFAULT_STEPS, PRESETS, STEP_LABEL, stepWords, stepProblem, timetable,
  type Step, type Anchors,
} from '@/lib/chit/reminderSchedule'
import type { ChitMember } from '@/lib/chit/types'

export default function ReminderScheduleTab({
  groupId, groupSteps, members, anchors, whatsappLive,
}: {
  groupId: string
  /** What the group holds now. Empty means the app's defaults. */
  groupSteps: Step[] | null
  members: ChitMember[]
  /** This month's auction and the next, for the timetable. */
  anchors: Anchors | null
  /** Whether a WhatsApp number is registered — decides what we promise. */
  whatsappLive: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [steps, setSteps] = useState<Step[]>(groupSteps?.length ? groupSteps : [...DEFAULT_STEPS])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const problems = steps.map(stepProblem)
  const canSave = dirty && problems.every(p => p === null)

  const times = useMemo(
    () => (anchors ? timetable(steps, anchors) : []),
    [steps, anchors])

  function edit(key: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    const { error } = await sb.from('chit_groups').update({ reminder_steps: steps }).eq('id', groupId)
    setSaving(false)
    if (error) { notify(error.message, 'error'); return }
    notify('Schedule saved', 'success')
    setDirty(false)
    router.refresh()
  }

  async function reset() {
    setSteps([...DEFAULT_STEPS])
    setDirty(true)
  }

  /** A member's override: a preset, or back to following the group. */
  async function setMemberSteps(memberId: string, value: Step[] | null, label: string) {
    const { error } = await sb.from('chit_members').update({ reminder_steps: value }).eq('id', memberId)
    if (error) { notify(error.message, 'error'); return }
    notify(label, 'success')
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const field = 'w-16 px-2 py-1 rounded-lg border text-[13px] text-right'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  const overridden = members.filter(m => Array.isArray((m as { reminder_steps?: Step[] }).reminder_steps)
    && ((m as { reminder_steps?: Step[] }).reminder_steps ?? []).length > 0)

  return (
    <div className="space-y-4">
      {/* What will actually happen, before anything else. */}
      <div className="rounded-2xl p-4" style={card}>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {whatsappLive
            ? 'These go out by themselves each day at 8am. A reminder is only sent to a member who still owes.'
            : 'No WhatsApp number is registered yet, so nothing sends on its own. Each message that falls due is recorded as pending, and the moment the number is live they start going out at 8am without anything changing here.'}
        </p>
      </div>

      {/* ── The six steps ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            The group&rsquo;s schedule
          </p>
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <RotateCcw className="w-3.5 h-3.5" /> Back to defaults
          </button>
        </div>

        {steps.map((s, i) => (
          <div key={s.key} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: s.enabled ? 1 : 0.55 }}>
            <input type="checkbox" checked={s.enabled} onChange={e => edit(s.key, { enabled: e.target.checked })}
              className="w-4 h-4 shrink-0" aria-label={`Send ${STEP_LABEL[s.kind]}`} />

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                {STEP_LABEL[s.kind]}
                {s.audience === 'unpaid' && <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · only those who owe</span>}
                {s.audience === 'winner' && <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · the winner only</span>}
              </p>
              <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{stepWords(s)}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input value={String(s.offsetDays)} inputMode="numeric" className={field} style={fieldStyle}
                onChange={e => edit(s.key, { offsetDays: parseInt(e.target.value, 10) || 0 })}
                aria-label="Days" />
              <select value={s.anchor} onChange={e => edit(s.key, { anchor: e.target.value as Step['anchor'] })}
                className="px-2 py-1 rounded-lg border text-[12.5px]" style={fieldStyle}>
                <option value="auction">days from this auction</option>
                <option value="next_auction">days from the next auction</option>
              </select>
            </div>

            {problems[i] && <p className="text-[11.5px] w-full" style={{ color: 'var(--expense)' }}>{problems[i]}</p>}
          </div>
        ))}

        <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            Negative is before, positive after, 0 on the day.
          </p>
          <button onClick={save} disabled={!canSave || saving}
            className="px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save schedule'}
          </button>
        </div>
      </div>

      {/* ── What that means in dates ───────────────────────────────────────── */}
      {times.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={card}>
          <p className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide"
            style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            This month, in dates
          </p>
          {times.map(({ step, date }) => (
            <div key={step.key} className="px-4 py-2 flex items-center justify-between gap-3"
              style={{ borderTop: '1px solid var(--border)', opacity: step.enabled ? 1 : 0.5 }}>
              <span className="text-[12.5px]" style={{ color: 'var(--text)' }}>{STEP_LABEL[step.kind]}</span>
              <span className="text-[12.5px] tabular-nums" style={{ color: date ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                {date ?? 'waiting on the next auction date'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Members who need different handling ────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <p className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide"
          style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          Members · {overridden.length} on their own schedule
        </p>
        {members.length === 0 ? (
          <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>No members in this group yet.</p>
        ) : members.map((m, i) => {
          const own = ((m as { reminder_steps?: Step[] }).reminder_steps ?? [])
          const mode = own.length === 0 ? 'group'
            : own.length === PRESETS.gentle.length && own.every(s => s.kind !== 'reminder') ? 'gentle'
            : own.length > DEFAULT_STEPS.length ? 'persistent' : 'custom'
          return (
            <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="min-w-0">
                <p className="text-[13px] truncate" style={{ color: 'var(--text)' }}>{m.name}</p>
                {!m.phone && <p className="text-[11px]" style={{ color: 'var(--expense)' }}>no phone number — nothing can be sent</p>}
              </div>
              <select
                value={mode}
                onChange={e => {
                  const v = e.target.value
                  if (v === 'group') setMemberSteps(m.id, null, `${m.name} follows the group`)
                  else if (v === 'gentle') setMemberSteps(m.id, [...PRESETS.gentle], `${m.name}: notice and dues only`)
                  else if (v === 'persistent') setMemberSteps(m.id, [...PRESETS.persistent], `${m.name}: every reminder, plus two`)
                }}
                className="px-2 py-1 rounded-lg border text-[12.5px] shrink-0" style={fieldStyle}>
                <option value="group">follows the group</option>
                <option value="gentle">gentle — notice and dues only</option>
                <option value="persistent">persistent — every reminder, plus two</option>
                {mode === 'custom' && <option value="custom">custom</option>}
              </select>
            </div>
          )
        })}
      </div>

    </div>
  )
}
