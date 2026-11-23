'use client'

// Send one message — now or later — to everybody, one group, or one member.
//
// WHY THE SCOPE COMES FIRST
//
// The first thing anybody does with a new WhatsApp connection is test it, and
// the last thing they want is to test it on sixty people. So 'who' is a choice
// before 'send' is a button, and the confirmation says the choice back in
// words.
//
// It asks once before sending, because sixty messages cannot be recalled. The
// route will not send the same message twice in a day whatever this screen
// does — see app/api/chit/send-now.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Clock, X } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { audienceWords, type MessageTemplate } from '@/lib/chit/messageTemplates'
import {
  scheduleProblem, whenWords, precisionWords, scopeWords, needsGroupChoice,
  type SendScope,
} from '@/lib/chit/outbox'

export interface QueuedRow {
  id: string
  send_at: string
  scope: SendScope
  status: string
  result: string | null
  template?: { label: string | null } | null
  group?: { name: string | null } | null
  member?: { name: string | null } | null
}

export default function SendNow({
  templates, connected, groups, members, groupsByMember = {}, queued = [], frequentTrigger = false,
}: {
  templates: MessageTemplate[]
  connected: boolean
  groups: { id: string; name: string }[]
  members: { id: string; name: string }[]
  /** The chits each member sits in. A member in two has two sets of figures. */
  groupsByMember?: Record<string, { id: string; name: string }[]>
  queued?: QueuedRow[]
  /** Whether something checks the outbox more often than once a day. */
  frequentTrigger?: boolean
}) {
  const router = useRouter()
  const [id, setId] = useState('')
  const [scope, setScope] = useState<SendScope>('group')
  const [groupId, setGroupId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [later, setLater] = useState(false)
  const [when, setWhen] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ note: string; notes: string[] } | null>(null)

  const live = templates.filter(t => !t.archived && t.id)
  const chosen = live.find(t => t.id === id)
  // A datetime-local value is in the browser's own timezone, which is the
  // operator's. Turning it into an instant here keeps the server out of
  // guessing timezones.
  const sendAt = later && when ? new Date(when).toISOString() : null
  // Which chits this member is in. Their dues and their dividend belong to a
  // chit, so one of them has to be named before anything can be worked out.
  const theirGroups = groupsByMember[memberId] ?? []
  const mustPickGroup = needsGroupChoice(scope, theirGroups.length)
  const target = scope === 'group'
    ? groups.find(g => g.id === groupId)?.name
    : scope === 'member' ? members.find(m => m.id === memberId)?.name : null

  const problem = scheduleProblem({
    templateId: id, scope, groupId, memberId, sendAt,
    memberGroups: scope === 'member' ? theirGroups.length : null,
  })

  async function go() {
    setBusy(true)
    setAsking(false)
    try {
      const res = await fetch('/api/chit/send-now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id, scope, groupId: groupId || null, memberId: memberId || null, sendAt }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not send', 'error'); return }
      if (data.queued) {
        notify(`Queued — it leaves ${whenWords(sendAt!)}.`, 'success')
        setLater(false); setWhen('')
      } else {
        setResult({ note: String(data.note ?? ''), notes: (data.notes ?? []) as string[] })
        notify(data.note ?? 'Done', 'success')
      }
      router.refresh()
    } finally { setBusy(false) }
  }

  async function cancel(rowId: string) {
    const res = await fetch(`/api/chit/send-now?id=${rowId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { notify(data.error ?? 'Could not cancel', 'error'); return }
    notify('Called off.', 'success')
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const field = 'px-2 py-2 rounded-lg border text-[13px]'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const waiting = queued.filter(q => q.status === 'queued')

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <p className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide"
        style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        Send a message
      </p>

      <div className="p-4 space-y-3">
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          Outside the schedule — the auction has moved, the office is shut, or you are testing
          the connection on one person.
        </p>

        {/* What */}
        <select value={id} onChange={e => { setId(e.target.value); setResult(null) }}
          className={`${field} w-full`} style={fieldStyle}>
          <option value="">— choose a message —</option>
          {live.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {/* Who */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={scope} onChange={e => setScope(e.target.value as SendScope)}
            className={field} style={fieldStyle}>
            <option value="member">one member</option>
            <option value="group">one group</option>
            <option value="all">every active group</option>
          </select>

          {scope === 'group' && (
            <select value={groupId} onChange={e => setGroupId(e.target.value)}
              className={`${field} flex-1 min-w-[160px]`} style={fieldStyle}>
              <option value="">— which group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}

          {scope === 'member' && (
            <select value={memberId} onChange={e => { setMemberId(e.target.value); setGroupId('') }}
              className={`${field} flex-1 min-w-[160px]`} style={fieldStyle}>
              <option value="">— which member —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}

          {/* In two chits, so which one is this about? */}
          {mustPickGroup && (
            <select value={groupId} onChange={e => setGroupId(e.target.value)}
              className={`${field} flex-1 min-w-[160px]`} style={fieldStyle}>
              <option value="">— which chit —</option>
              {theirGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>

        {/* When */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={later} onChange={e => setLater(e.target.checked)} className="w-4 h-4" />
            <Clock className="w-3.5 h-3.5" /> at a set date and time
          </label>
          {later && (
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
              className={field} style={fieldStyle} />
          )}
        </div>

        {later && (
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {precisionWords(frequentTrigger)}
          </p>
        )}

        {scope === 'member' && theirGroups.length === 1 && (
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            About their {theirGroups[0].name} chit.
          </p>
        )}

        {chosen && (
          <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            {scope === 'member'
              ? `Goes to ${target ?? 'them'} only.`
              : `Goes to ${audienceWords(chosen.audience)}, ${scopeWords(scope, target)}.`}
            {!connected && ' No WhatsApp number is registered, so it will be recorded as pending instead of sent.'}
            {connected && chosen.status !== 'APPROVED'
              && ' Meta has not approved this message yet, so it cannot go out.'}
          </p>
        )}

        {problem && id !== '' && (
          <p className="text-[11.5px]" style={{ color: 'var(--expense)' }}>{problem}</p>
        )}

        <div className="flex items-center gap-2">
          <button onClick={() => setAsking(true)} disabled={!!problem || busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {later ? 'Queue it' : 'Send'}
          </button>
        </div>

        {asking && chosen && (
          <div className="rounded-xl p-3 space-y-2"
            style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}>
            <p className="text-[12.5px]" style={{ color: 'var(--text)' }}>
              Send <b>{chosen.label}</b> {scope === 'member' ? `to ${target}` : scopeWords(scope, target)}
              {sendAt ? `, ${whenWords(sendAt)}` : ' now'}? This cannot be undone once it goes.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={go} className="px-3 py-1.5 rounded-xl text-white text-[12.5px] font-bold"
                style={{ background: 'var(--brand)' }}>
                Yes, {later ? 'queue it' : 'send it'}
              </button>
              <button onClick={() => setAsking(false)}
                className="px-3 py-1.5 rounded-xl text-[12.5px] font-bold"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                No
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{result.note}</p>
            {result.notes.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {result.notes.map((n, i) => (
                  <li key={i} className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>· {n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Waiting to go */}
      {queued.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <p className="px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide"
            style={{ color: 'var(--text-faint)', background: 'var(--surface-2)' }}>
            {waiting.length > 0 ? `${waiting.length} waiting to go` : 'Recently queued'}
          </p>
          {queued.slice(0, 20).map(q => (
            <div key={q.id} className="px-4 py-2.5 flex items-start justify-between gap-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-[12.5px]" style={{ color: 'var(--text)' }}>
                  {q.template?.label ?? 'a message'}{' '}
                  <span style={{ color: 'var(--text-faint)' }}>
                    {scopeWords(q.scope, q.group?.name ?? q.member?.name)}
                  </span>
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {q.status === 'queued'
                    ? `leaves ${whenWords(q.send_at)} · ${new Date(q.send_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
                    : `${q.status}${q.result ? ` · ${q.result}` : ''}`}
                </p>
              </div>
              {q.status === 'queued' && (
                <button onClick={() => cancel(q.id)}
                  className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold"
                  style={{ color: 'var(--text-muted)' }}>
                  <X className="w-3.5 h-3.5" /> call off
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
