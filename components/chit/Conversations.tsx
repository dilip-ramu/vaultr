'use client'

// The conversations, as a chat rather than a list.
//
// WHY IT LOOKS LIKE THIS
//
// A flat list of replies falls apart at fifteen messages: four people saying
// 'paid' in no order anybody can follow. A chit operator does not read
// messages, they read a PERSON — what was sent to Ravi, what Ravi said back,
// and whether he owes anything.
//
// So: people on the left, the conversation on the right, both sides in time
// order. It stays a panel on the Messages page rather than a page of its own,
// because it belongs beside the wording and the schedule.
//
// The reply box only works inside WhatsApp's 24-hour window — see
// lib/whatsapp/cloud.ts — and says how long is left rather than failing when
// pressed.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Search, Send, Loader2, ChevronLeft, Check, Paperclip, BellOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { windowLeftMinutes, windowWords } from '@/lib/whatsapp/cloud'
import {
  buildThreads, preview, searchThreads, dayLabel, statusLabel,
  type InboxRow, type OutRow, type Thread,
} from '@/lib/chit/conversations'

export default function Conversations({ inbox, sent, groupsByMember = {} }: {
  inbox: InboxRow[]
  sent: OutRow[]
  groupsByMember?: Record<string, string[]>
}) {
  const router = useRouter()
  const sb = createClient()
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const threads = useMemo(
    () => buildThreads(inbox, sent, groupsByMember),
    [inbox, sent, groupsByMember])
  const shown = useMemo(() => searchThreads(threads, q), [threads, q])

  // The one on screen: whatever was picked, else the first with something
  // unread, else the newest.
  const open: Thread | undefined =
    threads.find(t => t.memberId === openId) ?? shown[0]

  const unreadTotal = threads.reduce((n, t) => n + t.unread, 0)
  const minutesLeft = open ? windowLeftMinutes(open.lastInboundAt) : 0

  async function markRead(t: Thread) {
    const ids = t.messages.filter(m => m.dir === 'in' && m.unread).map(m => m.id)
    if (ids.length === 0) return
    await sb.from('chit_message_inbox').update({ handled: true }).in('id', ids)
    router.refresh()
  }

  async function send(t: Thread) {
    if (!draft.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/chit/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: t.memberId, text: draft }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not send', 'error'); return }
      setDraft('')
      await markRead(t)
      router.refresh()
    } finally { setSending(false) }
  }

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const time = (at: string) => {
    const d = new Date(at)
    return Number.isNaN(d.getTime()) ? ''
      : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
          Conversations{unreadTotal > 0 ? ` · ${unreadTotal} unread` : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="name, number, chit or words"
            className="px-2 py-1 rounded-lg border text-[12.5px] w-52"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
        </div>
      </div>

      {threads.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-center" style={{ color: 'var(--text-faint)' }}>
          Nothing yet. Messages you send and replies members write appear here as conversations.
        </p>
      ) : (
        <div className="grid md:grid-cols-[260px_1fr]" style={{ height: 520 }}>
          {/* ── Who ──────────────────────────────────────────────────────── */}
          <div className={`${open && openId ? 'hidden md:block' : 'block'} overflow-y-auto`}
            style={{ borderRight: '1px solid var(--border)' }}>
            {shown.length === 0 && (
              <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>Nobody by that.</p>
            )}
            {shown.map(t => (
              <button key={t.memberId}
                onClick={() => { setOpenId(t.memberId); setDraft(''); markRead(t) }}
                className="w-full px-3 py-2.5 text-left"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: open?.memberId === t.memberId ? 'var(--surface-2)' : undefined,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>
                    {t.name}
                  </p>
                  {t.unread > 0 && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: 'var(--brand)' }}>{t.unread}</span>
                  )}
                </div>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {[t.code, ...t.groups].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11.5px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {preview(t)}
                </p>
              </button>
            ))}
          </div>

          {/* ── The conversation ─────────────────────────────────────────── */}
          <div className={`${open && openId ? 'flex' : 'hidden md:flex'} flex-col min-h-0`}>
            {!open ? (
              <p className="p-4 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
                Pick somebody on the left.
              </p>
            ) : (
              <>
                <div className="px-3 py-2 flex items-center gap-2"
                  style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <button onClick={() => setOpenId(null)} className="md:hidden p-1"
                    style={{ color: 'var(--text-muted)' }} aria-label="Back to the list">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{open.name}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                      {[open.code, open.phone, ...open.groups].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ background: 'var(--surface-2)' }}>
                  {open.messages.map((m, idx) => {
                    const prev = open.messages[idx - 1]
                    const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at)
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <p className="text-center text-[10.5px] my-2" style={{ color: 'var(--text-faint)' }}>
                            {dayLabel(m.at)}
                          </p>
                        )}
                        <div className={`flex ${m.dir === 'out' ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%] rounded-2xl px-3 py-2"
                            style={m.dir === 'out'
                              ? { background: 'color-mix(in srgb, var(--brand) 16%, var(--surface))', border: '1px solid var(--border)' }
                              : { background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <p className="text-[12.5px] whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                              {m.text || '—'}
                            </p>

                            {m.mediaId && m.mediaKind === 'image' && (
                              <a href={`/api/chit/media/${m.id}`} target="_blank" rel="noreferrer"
                                className="block mt-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/chit/media/${m.id}`} alt="what they sent"
                                  className="rounded-lg max-h-48" style={{ border: '1px solid var(--border)' }} />
                              </a>
                            )}
                            {m.mediaId && m.mediaKind !== 'image' && (
                              <a href={`/api/chit/media/${m.id}`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11.5px] font-bold mt-1"
                                style={{ color: 'var(--brand)' }}>
                                <Paperclip className="w-3 h-3" /> open the {m.mediaKind}
                              </a>
                            )}

                            <p className="text-[10px] mt-1 flex items-center gap-1.5"
                              style={{ color: m.status === 'failed' ? 'var(--expense)' : 'var(--text-faint)' }}>
                              {time(m.at)}
                              {m.dir === 'out' && statusLabel(m.status) && <>· {statusLabel(m.status)}</>}
                              {m.looksPaid && (
                                <span style={{ color: 'var(--income)' }}>· says paid, check the collection</span>
                              )}
                            </p>
                            {m.dir === 'out' && m.status === 'failed' && m.note && (
                              <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--expense)' }}>{m.note}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Replying in your own words ───────────────────────────── */}
                <div className="px-3 py-2.5 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                  {minutesLeft > 0 ? (
                    <>
                      <div className="flex items-end gap-2">
                        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
                          placeholder={`Reply to ${open.name}…`}
                          className="flex-1 px-3 py-2 rounded-xl border text-[13px] resize-none"
                          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                        <button onClick={() => send(open)} disabled={sending || !draft.trim()}
                          className="shrink-0 p-2.5 rounded-xl text-white disabled:opacity-50"
                          style={{ background: 'var(--brand)' }} aria-label="Send">
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                        {windowWords(open.lastInboundAt)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
                      <BellOff className="w-3.5 h-3.5" />
                      {windowWords(open.lastInboundAt)}
                    </p>
                  )}
                  {open.unread > 0 && (
                    <button onClick={() => markRead(open)}
                      className="inline-flex items-center gap-1 text-[11.5px] font-bold"
                      style={{ color: 'var(--brand)' }}>
                      <Check className="w-3.5 h-3.5" /> mark as read
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
