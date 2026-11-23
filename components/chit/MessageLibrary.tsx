'use client'

// The messages, written here, for every group.
//
// WHY IT LOOKS LIKE THIS
//
// ONE LIBRARY. These messages are not attached to a group — a notice written
// four times for four groups is three chances to say something different. Each
// group's Reminders tab chooses which message goes out and when.
//
// YOU WRITE THE WORDS. The app contributes two things and gets out of the way:
// the details it can fill in (pick one and it drops into the sentence), and
// every rule Meta would reject the message for, checked as you type. A message
// is reviewed by Meta for up to 24 hours, and once approved may be edited only
// once a day and ten times a month — so a mistake found after submitting is
// expensive in a way one found while typing is not.
//
// THE PREVIEW IS NOT DECORATION. A message reads differently with real figures
// in it, and 'overdue by 0 days' is the kind of sentence nobody notices until a
// member receives it.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, RefreshCw, Send, Plus, Copy, Archive, Save, ArchiveRestore, MessageSquare,
} from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { statusWords, editsLeft, type TemplateCategory } from '@/lib/whatsapp/templateSpec'
import { GROUP_LABEL, fieldsFor, type FieldSpec } from '@/lib/chit/messageFields'
import {
  templateProblems, previewOf, insertToken, blankTemplate, duplicateOf,
  slugFromLabel, uniqueName, audienceWords, STARTER_LIBRARY, type MessageTemplate,
} from '@/lib/chit/messageTemplates'
import type { Audience } from '@/lib/chit/reminderSchedule'

/** One row on screen: a message plus a key that survives saving and filtering. */
interface Row { key: string; t: MessageTemplate }

let localKeys = 0
const newKey = () => `new-${++localKeys}`

export default function MessageLibrary({ saved, connected }: {
  saved: MessageTemplate[]
  /** Whether a WhatsApp business account is connected. */
  connected: boolean
}) {
  const router = useRouter()
  // Local copies, so a half-written message is not lost by a re-render. An
  // unsaved new message has id '' and lives only here until it is saved, so
  // every row carries its own key rather than relying on an id or a position
  // in a filtered list — both of which move under it.
  const [list, setList] = useState<Row[]>(saved.map(t => ({ key: t.id, t })))
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const cursor = useRef<number>(0)

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const field = 'w-full px-3 py-2 rounded-lg border text-[13px] mt-1'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  const live = list.filter(r => !r.t.archived)
  const archived = list.filter(r => r.t.archived)

  function edit(key: string, patch: Partial<MessageTemplate>) {
    setList(prev => prev.map(r => (r.key === key ? { ...r, t: { ...r.t, ...patch } } : r)))
  }

  /** Drop a detail into the sentence where the cursor was. */
  function addField(key: string, t: MessageTemplate, f: FieldSpec) {
    const at = bodyRef.current === null ? t.body.length : cursor.current
    edit(key, { body: insertToken(t.body, at, f.id) })
    cursor.current = at + f.id.length + 4
  }

  function addNew() {
    const key = newKey()
    setList(prev => [...prev, { key, t: blankTemplate(prev.map(r => r.t.name)) }])
    setOpen(key)
  }

  function addStarters() {
    setList(prev => {
      const taken = prev.map(r => r.t.name)
      return [...prev, ...STARTER_LIBRARY.map(t => ({
        key: newKey(),
        t: { ...t, name: uniqueName(t.label, taken) },
      }))]
    })
    notify('Five messages to start from. Save the ones you want.', 'success')
  }

  async function save(key: string, t: MessageTemplate, submit: boolean) {
    const found = templateProblems(t)
    if (found.length > 0) { notify(found[0].message, 'error'); return }
    setBusy(key)
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: t, submit }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not save it', 'error'); return }
      if (data.id && !t.id) edit(key, { id: String(data.id) })
      notify(data.note ?? (submit
        ? 'Sent to Meta — a decision usually comes within 24 hours.'
        : 'Saved.'), 'success')
      router.refresh()
    } finally { setBusy(null) }
  }

  async function archive(key: string, t: MessageTemplate, restore: boolean) {
    // Never saved: it only exists here, so dropping it is the whole job.
    if (!t.id) { setList(prev => prev.filter(r => r.key !== key)); return }
    setBusy(t.id)
    try {
      const res = await fetch(`/api/whatsapp/templates?id=${t.id}${restore ? '&restore=1' : ''}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not do that', 'error'); return }
      setList(prev => prev.map(r => (r.t.id === t.id ? { ...r, t: { ...r.t, archived: !restore } } : r)))
      notify(restore ? 'Back in the list.' : 'Put away. Nothing is deleted.', 'success')
      router.refresh()
    } finally { setBusy(null) }
  }

  function duplicate(t: MessageTemplate) {
    const key = newKey()
    setList(prev => [...prev, { key, t: duplicateOf(t, prev.map(r => r.t.name)) }])
    setOpen(key)
    notify('A copy, as a draft. Change it and save.', 'success')
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/whatsapp/templates')
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not ask Meta', 'error'); return }
      notify(data.note ?? `${data.refreshed} checked with Meta`, 'success')
      router.refresh()
    } finally { setRefreshing(false) }
  }

  function row({ key, t }: Row) {
    const isOpen = open === key
    const found = templateProblems(t)
    const left = editsLeft(t.editTimes ?? [])
    const groups = Array.from(new Set(fieldsFor(t.audience).map(f => f.group)))
    const statusTone = t.status === 'APPROVED' ? 'var(--income)'
      : t.status === 'REJECTED' || t.status === 'DISABLED' ? 'var(--expense)'
      : t.status === 'PENDING' ? 'var(--text-muted)' : 'var(--text-faint)'

    return (
      <div key={key} style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setOpen(isOpen ? null : key)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
              {t.label || 'Untitled message'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              to {audienceWords(t.audience)} · {t.name}
            </p>
          </div>
          <span className="text-[11px] font-bold shrink-0" style={{ color: statusTone }}>
            {t.id ? t.status.toLowerCase() : 'not saved'}
          </span>
        </button>

        {isOpen && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-[11.5px]" style={{ color: statusTone }}>
              {t.id ? statusWords(t.status, t.categoryAssigned, t.category) : 'Not saved yet.'}
            </p>
            {t.rejectedReason && (
              <p className="text-[11.5px] rounded-lg px-3 py-2"
                style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}>
                Meta said: {t.rejectedReason}
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                What you call it
                <input value={t.label}
                  onChange={e => edit(key, {
                    label: e.target.value,
                    // The Meta name follows the title until the message has been
                    // submitted. After that it is fixed: Meta will not rename one.
                    name: t.status === 'DRAFT' ? slugFromLabel(e.target.value) : t.name,
                  })}
                  className={field} style={fieldStyle} placeholder="Second reminder" />
              </label>

              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Who it goes to
                <select value={t.audience}
                  onChange={e => edit(key, { audience: e.target.value as Audience })}
                  className={field} style={fieldStyle}>
                  <option value="all">every member</option>
                  <option value="except_winner">every member except the winner</option>
                  <option value="winner">the auction winner</option>
                  <option value="unpaid">members who still owe</option>
                </select>
              </label>
            </div>

            <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              The message
              <textarea value={t.body}
                ref={el => { if (isOpen) bodyRef.current = el }}
                onChange={e => { cursor.current = e.target.selectionStart; edit(key, { body: e.target.value }) }}
                onSelect={e => { cursor.current = (e.target as HTMLTextAreaElement).selectionStart }}
                rows={5} className={`${field} font-normal`} style={fieldStyle}
                placeholder="Hello {{member_name}}, …" />
            </label>

            {/* The details it can fill in. Pick one and it lands at the cursor. */}
            <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Add a detail — it goes in where you were typing
              </p>
              {groups.map(g => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] w-24 shrink-0" style={{ color: 'var(--text-faint)' }}>
                    {GROUP_LABEL[g]}
                  </span>
                  {fieldsFor(t.audience).filter(f => f.group === g).map(f => (
                    <button key={f.id} type="button" title={f.note ?? `example: ${f.sample}`}
                      onClick={() => addField(key, t, f)}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
              <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                Anything else you want to say — a new rule, where to pay, a request to confirm
                bank details — is just words. Type it in.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Footer (optional, same for everybody)
                <input value={t.footer ?? ''} onChange={e => edit(key, { footer: e.target.value })}
                  className={field} style={fieldStyle} placeholder="Sri Uma Chits" />
              </label>

              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                If a detail is missing
                <select value={t.onMissing ?? 'hold'}
                  onChange={e => edit(key, { onMissing: e.target.value === 'fill' ? 'fill' : 'hold' })}
                  className={field} style={fieldStyle}>
                  <option value="hold">hold the message back</option>
                  <option value="fill">send it saying &ldquo;missing&rdquo;</option>
                </select>
                <span className="block mt-1 text-[10.5px] font-normal" style={{ color: 'var(--text-faint)' }}>
                  Hold back a reminder rather than send &ldquo;Rs missing is due&rdquo;. Send
                  anyway when the point of the message is to get the detail from them.
                </span>
              </label>

              <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Ask Meta for
                <select value={t.category}
                  onChange={e => edit(key, { category: e.target.value as TemplateCategory })}
                  className={field} style={fieldStyle}>
                  <option value="UTILITY">utility — about their own account</option>
                  <option value="MARKETING">marketing — promotional</option>
                </select>
                <span className="block mt-1 text-[10.5px] font-normal" style={{ color: 'var(--text-faint)' }}>
                  Meta decides in the end. Marketing costs roughly 7.5&times; more per message.
                </span>
              </label>
            </div>

            {/* With the example values filled in. */}
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-faint)' }}>
                What a member sees
              </p>
              <p className="text-[12.5px] whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                {previewOf(t) || '—'}
              </p>
              {t.footer && <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>{t.footer}</p>}
            </div>

            {found.length > 0 && (
              <ul className="space-y-1">
                {found.map((p, j) => (
                  <li key={j} className="text-[11.5px]" style={{ color: 'var(--expense)' }}>· {p.message}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-3">
                <button onClick={() => duplicate(t)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <button onClick={() => archive(key, t, false)} disabled={busy === t.id}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  <Archive className="w-3.5 h-3.5" /> Put away
                </button>
                {t.status === 'APPROVED' && (
                  <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {left.in24h} edit left today, {left.in30d} this month
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => save(key, t, false)} disabled={busy === key}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button onClick={() => save(key, t, true)} disabled={found.length > 0 || busy === key}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
                  style={{ background: 'var(--brand)' }}>
                  <Send className="w-3.5 h-3.5" />
                  {connected ? 'Submit to Meta' : 'Save for Meta'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
            {live.length} message{live.length === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={refresh} disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Check with Meta
            </button>
            <button onClick={addNew}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-[12px] font-bold"
              style={{ background: 'var(--brand)' }}>
              <Plus className="w-3.5 h-3.5" /> New message
            </button>
          </div>
        </div>

        <p className="px-4 pt-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          These are shared by every chit group — written once here. Each group&rsquo;s
          Reminders tab decides which message goes out and when, so you can have one
          reminder or four, worded differently.
          {!connected && ' No WhatsApp account is connected yet, so these are saved as drafts.'}
        </p>

        {live.length === 0 ? (
          <div className="px-4 py-6 text-center space-y-3">
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Nothing written yet.
            </p>
            <button onClick={addStarters}
              className="px-3.5 py-2 rounded-xl text-[13px] font-bold"
              style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
              Start from the usual five
            </button>
          </div>
        ) : live.map(r => row(r))}
      </div>

      {archived.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={card}>
          <button onClick={() => setShowArchived(v => !v)}
            className="w-full px-4 py-2.5 text-left text-[11px] font-extrabold uppercase tracking-wide"
            style={{ color: 'var(--text-faint)', background: 'var(--surface-2)' }}>
            Put away ({archived.length})
          </button>
          {showArchived && archived.map(({ t }) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{t.label}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{t.name}</p>
              </div>
              <button onClick={() => archive(t.id, t, true)} disabled={busy === t.id}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
                <ArchiveRestore className="w-3.5 h-3.5" /> Bring back
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
