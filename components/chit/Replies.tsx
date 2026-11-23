'use client'

// What members have written back.
//
// WHY THIS SCREEN EXISTS
//
// A Cloud API number has no app. Every reply a member sends — 'paid',
// 'please give me till Friday', 'stop' — arrives at a webhook and would
// otherwise be seen by nobody. With one number for the whole chit business,
// this is the only place those words are visible.
//
// The 'looks paid' mark is a guess and is shown as one. It is a reason to
// check the collection, never a collection: nothing in the books moves
// because somebody typed a word.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquare, BellOff, Send, Loader2, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { windowLeftMinutes, windowWords } from '@/lib/whatsapp/cloud'

export interface ReplyRow {
  id: string
  member_id: string | null
  body: string
  from_phone: string
  media_id?: string | null
  media_kind?: string | null
  looks_paid: boolean
  looks_stop: boolean
  handled: boolean
  received_at: string
  member?: { name: string; member_code?: string | null } | null
}

export default function Replies({ rows, groupsByMember = {} }: {
  rows: ReplyRow[]
  /** Which chits each member sits in, for the line above their words. */
  groupsByMember?: Record<string, string[]>
}) {
  const router = useRouter()
  const sb = createClient()
  const [showHandled, setShowHandled] = useState(false)
  // Which reply is being answered, and what has been typed.
  const [answering, setAnswering] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const open = rows.filter(r => !r.handled)
  const shown = showHandled ? rows : open

  /**
   * The newest thing this member wrote. The 24-hour window runs from there,
   * not from the reply being looked at — answering an old message is still
   * allowed if they have written since.
   */
  function lastFrom(memberId: string | null): string | null {
    if (!memberId) return null
    const theirs = rows.filter(r => r.member_id === memberId)
    return theirs.length === 0 ? null
      : theirs.reduce((a, b) => (a.received_at > b.received_at ? a : b)).received_at
  }

  async function send(r: ReplyRow) {
    if (!r.member_id || !draft.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/chit/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: r.member_id, text: draft }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not send', 'error'); return }
      notify('Sent.', 'success')
      setDraft('')
      setAnswering(null)
      // Answering it is dealing with it.
      await sb.from('chit_message_inbox').update({ handled: true }).eq('id', r.id)
      router.refresh()
    } finally { setSending(false) }
  }

  async function markHandled(id: string, handled: boolean) {
    const { error } = await sb.from('chit_message_inbox').update({ handled }).eq('id', id)
    if (error) { notify(error.message, 'error'); return }
    router.refresh()
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const when = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
          Replies{open.length > 0 ? ` · ${open.length} to read` : ''}
        </p>
        {rows.length > open.length && (
          <button onClick={() => setShowHandled(v => !v)}
            className="text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
            {showHandled ? 'only unread' : 'show all'}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          {rows.length === 0
            ? 'Nothing yet. Replies from members appear here, and you can answer them in your own words for 24 hours after they write.'
            : 'Everything read.'}
        </p>
      ) : shown.slice(0, 100).map((r, i) => (
        <div key={r.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
        <div className="px-4 py-3 flex items-start justify-between gap-3"
          style={{ opacity: r.handled ? 0.55 : 1 }}>
          <div className="min-w-0">
            <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                {r.member?.name ?? 'Unknown number'}
              </span>
              {r.member?.member_code ? ` · ${r.member.member_code}` : ''}
              {' · '}{r.from_phone}
              {(groupsByMember[r.member_id ?? ''] ?? []).length > 0
                && ` · ${(groupsByMember[r.member_id ?? ''] ?? []).join(', ')}`}
              {' · '}{when(r.received_at)}
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--text)' }}>{r.body || '—'}</p>

            {/* A picture comes through the server, because fetching it from
                Meta needs the token. */}
            {r.media_id && r.media_kind === 'image' && (
              <a href={`/api/chit/media/${r.id}`} target="_blank" rel="noreferrer"
                className="inline-block mt-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/chit/media/${r.id}`} alt="what they sent"
                  className="rounded-lg max-h-40"
                  style={{ border: '1px solid var(--border)' }} />
              </a>
            )}
            {r.media_id && r.media_kind !== 'image' && (
              <a href={`/api/chit/media/${r.id}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-bold mt-1"
                style={{ color: 'var(--brand)' }}>
                <Paperclip className="w-3.5 h-3.5" /> open the {r.media_kind}
              </a>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {r.looks_paid && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md"
                  style={{ background: 'color-mix(in srgb, var(--income) 14%, transparent)', color: 'var(--income)' }}>
                  says paid — check the collection
                </span>
              )}
              {r.looks_stop && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                  style={{ background: 'color-mix(in srgb, var(--expense) 12%, transparent)', color: 'var(--expense)' }}>
                  <BellOff className="w-3 h-3" /> asked to stop — no more messages go to them
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {r.member_id && windowLeftMinutes(lastFrom(r.member_id)) > 0 && (
              <button onClick={() => { setAnswering(answering === r.id ? null : r.id); setDraft('') }}
                className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
                <Send className="w-3.5 h-3.5" /> reply
              </button>
            )}
            <button onClick={() => markHandled(r.id, !r.handled)}
              className="inline-flex items-center gap-1 text-[12px] font-bold"
              style={{ color: r.handled ? 'var(--text-faint)' : 'var(--brand)' }}>
              <Check className="w-3.5 h-3.5" /> {r.handled ? 'unread' : 'read'}
            </button>
          </div>
        </div>

        {/* Your own words, allowed only inside WhatsApp's 24-hour window. */}
        {answering === r.id && (
          <div className="px-4 pb-3 space-y-2">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}
              placeholder={`Reply to ${r.member?.name ?? 'them'}…`}
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {windowWords(lastFrom(r.member_id))}
              </p>
              <button onClick={() => send(r)} disabled={sending || !draft.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-[12.5px] font-bold disabled:opacity-50"
                style={{ background: 'var(--brand)' }}>
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send
              </button>
            </div>
          </div>
        )}
        </div>
      ))}
    </div>
  )
}
