'use client'

// When each message goes out. One schedule for the whole chit business.
//
// WHY IT IS NOT PER GROUP
//
// It used to be. Four groups meant the same six intervals typed four times,
// and three of them quietly drifting apart. The messages were already one
// library for every group; the timing belongs at the same level. What is still
// per member is the override underneath — one rule for everybody, and a
// different rule for the few who need more pushing.
//
// WHY THERE ARE NO DATES ON THIS SCREEN
//
// There cannot be one list of dates any more: each group's auction falls on
// its own day, and the result messages are counted from the day that group's
// auction was RECORDED. So every step reads as a sentence about the auction
// rather than as a date, which is also how it is actually decided.
//
// Nothing here decides who gets what: that is lib/chit/reminderSchedule.ts,
// which is pure and tested.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import {
  DEFAULT_STEPS, stepWords, stepProblem, newStep, stepLabel, type Step,
} from '@/lib/chit/reminderSchedule'
import {
  matchStepsToLibrary, templateById, stepWarning, type MessageTemplate,
} from '@/lib/chit/messageTemplates'

export default function ReminderRules({
  userId, savedSteps, duesDueDays = null, templates = [], whatsappLive = false,
}: {
  /** Whose settings these are — the owner, even when a partner is editing. */
  userId: string
  /** What is stored now. Empty means the app's defaults. */
  savedSteps: Step[] | null
  duesDueDays?: number | null
  templates?: MessageTemplate[]
  whatsappLive?: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [steps, setSteps] = useState<Step[]>(
    matchStepsToLibrary(savedSteps?.length ? savedSteps : [...DEFAULT_STEPS], templates))
  const [dueDays, setDueDays] = useState<string>(duesDueDays == null ? '' : String(duesDueDays))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const live = templates.filter(t => !t.archived && t.id)
  const dueOffset = dueDays.trim() === '' ? null : parseInt(dueDays, 10)
  const problems = steps.map(stepProblem)
  const warnings = steps.map(s => stepWarning(s, templateById(templates, s.templateId), dueOffset))
  const canSave = dirty && problems.every(p => p === null)

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

  async function save() {
    setSaving(true)
    const { error } = await sb.from('chit_settings').upsert({
      user_id: userId,
      reminder_steps: steps,
      dues_due_days: dueOffset == null || !Number.isFinite(dueOffset) ? null : dueOffset,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { notify(error.message, 'error'); return }
    notify('Saved. Every group follows this.', 'success')
    setDirty(false)
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const numField = 'w-16 px-2 py-1 rounded-lg border text-[13px] text-right'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 space-y-2" style={card}>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {whatsappLive
            ? 'These go out by themselves each day at 8am, for every active group. A reminder only reaches a member who still owes.'
            : 'No WhatsApp number is registered yet, so nothing sends on its own. Each message that falls due is recorded as pending, and the moment the number is live they start going out at 8am without anything changing here.'}
        </p>
      </div>

      {/* ── When the subscription is owed ─────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={card}>
        <label className="text-[13px]" style={{ color: 'var(--text)' }}>
          The subscription is due
          <input value={dueDays} inputMode="numeric" placeholder="10"
            onChange={e => { setDueDays(e.target.value.replace(/[^0-9]/g, '')); setDirty(true) }}
            className={`${numField} mx-2`} style={fieldStyle} aria-label="Days after the auction" />
          days after the auction.
        </label>
        <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
          This is the date members are told, and what &ldquo;overdue by 12 days&rdquo; counts from.
          Left empty, it is owed by the next auction, and nothing is ever counted as overdue.
        </p>
      </div>

      {/* ── The steps ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            {steps.length} step{steps.length === 1 ? '' : 's'} · every group follows these
          </p>
          <button onClick={() => { setSteps(matchStepsToLibrary([...DEFAULT_STEPS], templates)); setDirty(true) }}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
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
                  <option value="auction">days from the auction</option>
                  <option value="settled">days from the auction being recorded</option>
                  <option value="next_auction">days from the next auction</option>
                </select>
                <button onClick={() => { setSteps(prev => prev.filter(x => x.key !== s.key)); setDirty(true) }}
                  aria-label="Remove this step" className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {stepWords(s)}
              {s.audience === 'unpaid' && ' · only those who owe'}
              {s.audience === 'winner' && ' · the winner only'}
            </p>

            {(problems[i] ?? warnings[i]) && (
              <p className="text-[11.5px]" style={{ color: 'var(--expense)' }}>{problems[i] ?? warnings[i]}</p>
            )}
          </div>
        ))}

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--border)' }}>
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
    </div>
  )
}
