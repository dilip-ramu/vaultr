'use client'

// When each message goes out, for this group.
//
// WHAT BELONGS WHERE
//
// The WORDING is not here. It is one library shared by every group, at
// Chit > Messages, because a notice written four times for four groups is
// three chances to say something different. This screen says WHICH of those
// messages goes out and WHEN — and there can be as many steps as the chit
// needs, not six.
//
// The group carries the schedule. A member may carry their own, which REPLACES
// the group's rather than merging with it: two schedules layered on each other
// cannot be reasoned about at the moment a message goes out at the wrong time,
// and somebody always has to.
//
// Nothing here decides who gets what — that is lib/chit/reminderSchedule.ts,
// pure and tested. This screen edits the numbers and shows the dates they
// produce, so a mistake is visible today rather than next month.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, RotateCcw, Plus, Trash2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import {
  DEFAULT_STEPS, PRESETS, stepWords, stepProblem, timetable, newStep, stepLabel,
  type Step, type Anchors,
} from '@/lib/chit/reminderSchedule'
import {
  matchStepsToLibrary, templateById, stepWarning, type MessageTemplate,
} from '@/lib/chit/messageTemplates'
import type { ChitMember } from '@/lib/chit/types'

export default function ReminderScheduleTab({
  groupId, groupSteps, members, anchors, whatsappLive, templates = [], duesDueDays = null,
}: {
  groupId: string
  /** What the group holds now. Empty means the app's defaults. */
  groupSteps: Step[] | null
  members: ChitMember[]
  /** This month's auction and the next, for the timetable. */
  anchors: Anchors | null
  /** Whether a WhatsApp number is registered — decides what we promise. */
  whatsappLive: boolean
  /** The message library, shared by every group. */
  templates?: MessageTemplate[]
  /** Days after the auction that the subscription is owed. */
  duesDueDays?: number | null
}) {
  const router = useRouter()
  const sb = createClient()
  // An existing schedule predates the library and names no message, so each
  // step is pointed at the one written for its job before anything is shown.
  const [steps, setSteps] = useState<Step[]>(
    matchStepsToLibrary(groupSteps?.length ? groupSteps : [...DEFAULT_STEPS], templates))
  const [dueDays, setDueDays] = useState<string>(duesDueDays == null ? '' : String(duesDueDays))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const live = templates.filter(t => !t.archived && t.id)
  const dueOffset = dueDays.trim() === '' ? null : parseInt(dueDays, 10)

  const problems = steps.map(stepProblem)
  const warnings = steps.map(s => stepWarning(s, templateById(templates, s.templateId), dueOffset))
  const canSave = dirty && problems.every(p => p === null)

  const times = useMemo(
    () => (anchors ? timetable(steps, anchors) : []),
    [steps, anchors])

  function edit(key: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s))
    setDirty(true)
  }

  /** Choosing the message also settles who the step is for. */
  function chooseTemplate(key: string, id: string) {
    const t = templateById(templates, id)
    edit(key, { templateId: id || null, audience: t?.audience ?? 'all', label: t?.label ?? null })
  }

  function addStep() {
    const t = live.find(x => x.audience === 'unpaid') ?? live[0]
    setSteps(prev => [...prev, newStep(prev, {
      templateId: t?.id ?? null,
      audience: t?.audience ?? 'unpaid',
      label: t?.label ?? null,
      offsetDays: (prev[prev.length - 1]?.offsetDays ?? 5) + 5,
    })])
    setDirty(true)
  }

  function removeStep(key: string) {
    setSteps(prev => prev.filter(s => s.key !== key))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    const { error } = await sb.from('chit_groups').update({
      reminder_steps: steps,
      dues_due_days: dueOffset == null || !Number.isFinite(dueOffset) ? null : dueOffset,
    }).eq('id', groupId)
    setSaving(false)
    if (error) { notify(error.message, 'error'); return }
    notify('Schedule saved', 'success')
    setDirty(false)
    router.refresh()
  }

  function reset() {
    setSteps(matchStepsToLibrary([...DEFAULT_STEPS], templates))
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
  const numField = 'w-16 px-2 py-1 rounded-lg border text-[13px] text-right'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  const overridden = members.filter(m => Array.isArray((m as { reminder_steps?: Step[] }).reminder_steps)
    && ((m as { reminder_steps?: Step[] }).reminder_steps ?? []).length > 0)

  return (
    <div className="space-y-4">
      {/* What will actually happen, before anything else. */}
      <div className="rounded-2xl p-4 space-y-2" style={card}>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {whatsappLive
            ? 'These go out by themselves each day at 8am. A reminder is only sent to a member who still owes.'
            : 'No WhatsApp number is registered yet, so nothing sends on its own. Each message that falls due is recorded as pending, and the moment the number is live they start going out at 8am without anything changing here.'}
        </p>
        <Link href="/chit/messages"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--brand)' }}>
          Write the messages <ExternalLink className="w-3.5 h-3.5" />
          <span className="font-normal" style={{ color: 'var(--text-faint)' }}>— one set for every group</span>
        </Link>
      </div>

      {/* ── When the subscription is owed ─────────────────────────────────── */}
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={card}>
        <label className="text-[13px]" style={{ color: 'var(--text)' }}>
          The subscription is due
          <input value={dueDays} inputMode="numeric" placeholder="10"
            onChange={e => { setDueDays(e.target.value.replace(/[^0-9]/g, '')); setDirty(true) }}
            className={`${numField} mx-2`} style={fieldStyle} aria-label="Days after the auction" />
          days after the auction.
        </label>
        <p className="text-[11.5px] w-full" style={{ color: 'var(--text-faint)' }}>
          This is the date members are told, and what &ldquo;overdue by 12 days&rdquo; counts from.
          Left empty, it is owed by the next auction, and nothing is ever counted as overdue.
        </p>
      </div>

      {/* ── The steps ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            {steps.length} step{steps.length === 1 ? '' : 's'} in this group&rsquo;s schedule
          </p>
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <RotateCcw className="w-3.5 h-3.5" /> Back to defaults
          </button>
        </div>

        {steps.map((s, i) => (
          <div key={s.key} className="px-4 py-3 space-y-2"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: s.enabled ? 1 : 0.55 }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input type="checkbox" checked={s.enabled} onChange={e => edit(s.key, { enabled: e.target.checked })}
                className="w-4 h-4 shrink-0" aria-label={`Send ${stepLabel(s)}`} />

              <select value={s.templateId ?? ''} onChange={e => chooseTemplate(s.key, e.target.value)}
                className="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg border text-[13px]" style={fieldStyle}>
                <option value="">— choose a message —</option>
                {live.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>

              <div className="flex items-center gap-2 shrink-0">
                <input value={String(s.offsetDays)} inputMode="numeric" className={numField} style={fieldStyle}
                  onChange={e => edit(s.key, { offsetDays: parseInt(e.target.value, 10) || 0 })}
                  aria-label="Days" />
                <select value={s.anchor} onChange={e => edit(s.key, { anchor: e.target.value as Step['anchor'] })}
                  className="px-2 py-1 rounded-lg border text-[12.5px]" style={fieldStyle}>
                  <option value="auction">days from this auction</option>
                  <option value="next_auction">days from the next auction</option>
                </select>
                <button onClick={() => removeStep(s.key)} aria-label="Remove this step"
                  className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {stepWords(s)}
              {s.audience === 'unpaid' && ' · only those who owe'}
              {s.audience === 'winner' && ' · the winner only'}
            </p>

            {problems[i] && <p className="text-[11.5px]" style={{ color: 'var(--expense)' }}>{problems[i]}</p>}
            {!problems[i] && warnings[i] && (
              <p className="text-[11.5px]" style={{ color: 'var(--expense)' }}>{warnings[i]}</p>
            )}
          </div>
        ))}

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={addStep}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--brand)' }}>
            <Plus className="w-3.5 h-3.5" /> Add a step
          </button>
          <div className="flex items-center gap-3">
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
              <span className="text-[12.5px]" style={{ color: 'var(--text)' }}>
                {templateById(templates, step.templateId)?.label ?? stepLabel(step)}
              </span>
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
                  const own2 = (ps: readonly Step[]) => matchStepsToLibrary([...ps], templates)
                  if (v === 'group') setMemberSteps(m.id, null, `${m.name} follows the group`)
                  else if (v === 'gentle') setMemberSteps(m.id, own2(PRESETS.gentle), `${m.name}: notice and dues only`)
                  else if (v === 'persistent') setMemberSteps(m.id, own2(PRESETS.persistent), `${m.name}: every reminder, plus two`)
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
