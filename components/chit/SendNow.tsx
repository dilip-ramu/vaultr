'use client'

// Send one message to every member, now.
//
// The schedule covers the month. This is for what a month does not: the
// auction has moved, the office is shut, a rule has changed.
//
// It asks once before sending, because sixty messages cannot be recalled, and
// it says plainly who it is about to reach. The route will not send the same
// message twice in a day whatever this screen does — see
// app/api/chit/send-now.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { audienceWords, type MessageTemplate } from '@/lib/chit/messageTemplates'

/** Who it reaches, said in the terms of a send that covers every group. */
function reach(a: string): string {
  switch (a) {
    case 'winner': return 'this month\u2019s winner in each active group'
    case 'except_winner': return 'every member except the winner, in every active group'
    case 'unpaid': return 'everybody who still owes, in every active group'
    default: return 'every member of every active group'
  }
}

const AUDIENCE_WORDS: Record<string, string> = {
  all: 'every member of every active group',
  winner: 'this month’s winner in each group',
  unpaid: 'everybody who still owes, in every active group',
}

export default function SendNow({ templates, connected }: {
  templates: MessageTemplate[]
  connected: boolean
}) {
  const router = useRouter()
  const [id, setId] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ note: string; notes: string[] } | null>(null)

  const live = templates.filter(t => !t.archived && t.id)
  const chosen = live.find(t => t.id === id)

  async function send() {
    setBusy(true)
    setAsking(false)
    try {
      const res = await fetch('/api/chit/send-now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not send', 'error'); return }
      setResult({ note: String(data.note ?? ''), notes: (data.notes ?? []) as string[] })
      notify(data.note ?? 'Done', 'success')
      router.refresh()
    } finally { setBusy(false) }
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <p className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide"
        style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        Send one now
      </p>

      <div className="p-4 space-y-3">
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          Outside the schedule, to every active group at once — the auction has moved, the office
          is shut, a rule has changed.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <select value={id} onChange={e => { setId(e.target.value); setResult(null) }}
            className="flex-1 min-w-[200px] px-2 py-2 rounded-lg border text-[13px]" style={fieldStyle}>
            <option value="">— choose a message —</option>
            {live.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button onClick={() => setAsking(true)} disabled={!chosen || busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>

        {chosen && (
          <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            Goes to {reach(chosen.audience)}.
            {!connected && ' No WhatsApp number is registered, so it will be recorded as pending instead of sent.'}
            {connected && chosen.status !== 'APPROVED'
              && ' Meta has not approved this message yet, so it cannot go out.'}
          </p>
        )}

        {asking && chosen && (
          <div className="rounded-xl p-3 space-y-2"
            style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}>
            <p className="text-[12.5px]" style={{ color: 'var(--text)' }}>
              Send <b>{chosen.label}</b> to {reach(chosen.audience)}? This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={send}
                className="px-3 py-1.5 rounded-xl text-white text-[12.5px] font-bold"
                style={{ background: 'var(--brand)' }}>
                Yes, send it
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
    </div>
  )
}
