// One member, one thread: what was said to them and what they said back.
//
// WHY THIS EXISTS
//
// The replies screen was one flat list. At fifteen messages it stops being
// readable and at sixty members it is useless — 'paid' from four different
// people, in no order anybody can follow.
//
// So the two sides are merged into a conversation per member: what the app
// sent (the log) and what they wrote (the inbox), in time order, the way any
// chat looks. Nothing here touches a database or a clock: rows in, threads
// out, so the ordering and the counting can be tested.

export type Direction = 'in' | 'out'

export interface ThreadMessage {
  id: string
  dir: Direction
  /** The words, as that member received or sent them. */
  text: string
  at: string
  /** Outgoing only: sent, delivered, read, failed, pending, held. */
  status?: string | null
  /** Outgoing only: what went wrong, or a note about a gap in it. */
  note?: string | null
  /** Incoming only: a picture or file they sent. */
  mediaId?: string | null
  mediaKind?: string | null
  /** Incoming only: it reads like a claim to have paid. */
  looksPaid?: boolean
  /** Incoming only: not yet dealt with. */
  unread?: boolean
}

export interface Thread {
  memberId: string
  name: string
  code?: string | null
  phone?: string | null
  /** Which chits they are in, for the line under their name. */
  groups: string[]
  messages: ThreadMessage[]
  /** The newest message either way, for ordering the list. */
  lastAt: string
  /** The newest thing THEY sent, which is what the 24-hour window runs from. */
  lastInboundAt: string | null
  unread: number
}

export interface InboxRow {
  id: string
  member_id: string | null
  body: string
  from_phone?: string | null
  media_id?: string | null
  media_kind?: string | null
  looks_paid?: boolean
  handled?: boolean
  received_at: string
  member?: { name?: string | null; member_code?: string | null } | null
}

export interface OutRow {
  id: string
  member_id: string | null
  body?: string | null
  kind?: string | null
  status?: string | null
  error?: string | null
  sent_at: string
  member?: { name?: string | null; member_code?: string | null } | null
}

const text = (v: unknown) => String(v ?? '').trim()

/**
 * Both sides, merged into one thread per member, newest conversation first.
 *
 * A row with no member is dropped: it belongs to nobody and would make a
 * thread with no name on it.
 */
export function buildThreads(
  inbox: readonly InboxRow[],
  out: readonly OutRow[],
  groupsByMember: Record<string, string[]> = {},
): Thread[] {
  const byMember = new Map<string, Thread>()

  const thread = (id: string, name: string, code?: string | null, phone?: string | null) => {
    const had = byMember.get(id)
    if (had) {
      // A name from either side will do; the first non-empty one wins.
      if (!had.name && name) had.name = name
      return had
    }
    const made: Thread = {
      memberId: id,
      name: name || 'Unknown',
      code: code ?? null,
      phone: phone ?? null,
      groups: groupsByMember[id] ?? [],
      messages: [],
      lastAt: '',
      lastInboundAt: null,
      unread: 0,
    }
    byMember.set(id, made)
    return made
  }

  for (const r of inbox) {
    const id = text(r.member_id)
    if (!id) continue
    const t = thread(id, text(r.member?.name), r.member?.member_code, r.from_phone)
    t.messages.push({
      id: r.id,
      dir: 'in',
      text: r.body ?? '',
      at: r.received_at,
      mediaId: r.media_id ?? null,
      mediaKind: r.media_kind ?? null,
      looksPaid: Boolean(r.looks_paid),
      unread: !r.handled,
    })
    if (!r.handled) t.unread++
    if (!t.lastInboundAt || r.received_at > t.lastInboundAt) t.lastInboundAt = r.received_at
  }

  for (const r of out) {
    const id = text(r.member_id)
    if (!id) continue
    const t = thread(id, text(r.member?.name), r.member?.member_code)
    t.messages.push({
      id: r.id,
      dir: 'out',
      // Older rows predate the body column, so the message says what it was
      // rather than pretending to quote words nobody kept.
      text: text(r.body) || (r.kind ? `(${r.kind})` : '(message)'),
      at: r.sent_at,
      status: r.status ?? null,
      note: r.error ?? null,
    })
  }

  const threads = [...byMember.values()]
  for (const t of threads) {
    t.messages.sort((a, b) => a.at.localeCompare(b.at))
    t.lastAt = t.messages.length > 0 ? t.messages[t.messages.length - 1].at : ''
  }
  // Unread first, because that is what the screen is for, then by recency.
  return threads.sort((a, b) =>
    Number(b.unread > 0) - Number(a.unread > 0) || b.lastAt.localeCompare(a.lastAt))
}

/** 'paid', shortened for the list column. */
export function preview(t: Thread, max = 60): string {
  const last = t.messages[t.messages.length - 1]
  if (!last) return ''
  const body = last.text.replace(/\s+/g, ' ').trim() || (last.mediaKind ? `[${last.mediaKind}]` : '')
  const words = last.dir === 'out' ? `You: ${body}` : body
  return words.length > max ? `${words.slice(0, max - 1)}…` : words
}

/** The threads matching what was typed into the search box. */
export function searchThreads(threads: readonly Thread[], q: string): Thread[] {
  const want = q.trim().toLowerCase()
  if (!want) return [...threads]
  return threads.filter(t =>
    t.name.toLowerCase().includes(want)
    || String(t.code ?? '').toLowerCase().includes(want)
    || String(t.phone ?? '').includes(want)
    || t.groups.some(g => g.toLowerCase().includes(want))
    || t.messages.some(m => m.text.toLowerCase().includes(want)))
}

/** 'Today', 'Yesterday', or the date — the separator between days. */
export function dayLabel(at: string, now: Date = new Date()): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const yesterday = new Date(now.getTime() - 86400000)
  if (day(d) === day(now)) return 'Today'
  if (day(d) === day(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The tick under an outgoing message, in words rather than symbols. */
export function statusLabel(status?: string | null): string {
  switch (String(status ?? '')) {
    case 'read': return 'read'
    case 'delivered': return 'delivered'
    case 'sent': return 'sent'
    case 'failed': return 'failed'
    case 'pending': return 'waiting'
    case 'held': return 'waiting for a detail'
    default: return ''
  }
}
