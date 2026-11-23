// What WhatsApp sends back: delivery reports, and replies from members.
//
// WHY IT MATTERS HERE MORE THAN USUAL
//
// A Cloud API number has no app and no inbox. A member who replies 'paid' is
// talking to nobody unless this file exists. With one number for the whole
// chit business — which is the position we are in — that is not a nicety.
//
// Two kinds of event arrive at the same endpoint:
//
//   statuses   sent -> delivered -> read for a message we sent, keyed by the
//              id Meta gave us when we sent it. This is also how a dead
//              number announces itself: delivered never arrives.
//   messages   what a member typed back.
//
// ── TWO RULES THAT MATTER ───────────────────────────────────────────────────
//
// THE ENDPOINT IS PUBLIC, SO EVERY REQUEST IS CHECKED. Meta signs each POST
// with the app secret. An unsigned or wrongly signed request is refused: the
// url is guessable and a fake 'read' or a fake reply would be worse than no
// webhook at all.
//
// STATUSES ARRIVE OUT OF ORDER. 'delivered' can land after 'read' on a slow
// connection, so a status is only ever allowed to move forwards — see
// betterStatus.
//
// Pure. The crypto is node's own; there is no database and no network here.

import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Meta's subscription handshake: it GETs the url with a challenge and expects
 * the challenge echoed back, but only if the verify token matches ours.
 */
export function verifyChallenge(
  params: { mode?: string | null; token?: string | null; challenge?: string | null },
  expected?: string | null,
): string | null {
  if (!expected) return null
  if (params.mode !== 'subscribe') return null
  if (!params.token || params.token !== expected) return null
  return params.challenge ?? null
}

/**
 * Whether this POST really came from Meta.
 *
 * The header is 'sha256=<hex>' over the RAW body — re-serialising the parsed
 * JSON gives a different string and the check fails, so the caller must keep
 * the body as it arrived.
 */
export function signatureOk(raw: string, header?: string | null, secret?: string | null): boolean {
  if (!secret || !header) return false
  const given = header.startsWith('sha256=') ? header.slice(7) : header
  const mine = createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  if (given.length !== mine.length) return false
  try {
    return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(mine, 'hex'))
  } catch {
    return false
  }
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface StatusEvent {
  /** The id Meta gave us when we sent it. */
  messageId: string
  status: DeliveryStatus
  /** Who it was to, digits only. */
  to: string
  /** Meta's own words when something went wrong. */
  error?: string | null
  at?: string | null
}

export type MediaKind = 'image' | 'document' | 'audio' | 'video' | 'sticker'

export interface InboundMessage {
  /** Meta's id for their message, so the same reply is never stored twice. */
  messageId: string
  /** Their number, digits only with country code. */
  from: string
  /** What they typed. A button press arrives as its label. */
  body: string
  /**
   * A picture or a file, when they sent one.
   *
   * WhatsApp does not deliver the file itself — only an id to fetch it with,
   * using the same token that sends messages. So the id is what is kept, and
   * the file is fetched when somebody actually opens it.
   */
  mediaId?: string | null
  mediaKind?: MediaKind | null
  mediaMime?: string | null
  at?: string | null
}

const str = (v: unknown) => (v == null ? '' : String(v))

/** An epoch-seconds string, as an ISO timestamp. */
function stamp(v: unknown): string | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}

const MEDIA_KINDS = ['image', 'document', 'audio', 'video', 'sticker'] as const

/** The picture or file on a message, if it carries one. */
function mediaOf(m: Record<string, unknown>): Pick<InboundMessage, 'mediaId' | 'mediaKind' | 'mediaMime'> {
  const type = str(m.type) as MediaKind
  if (!MEDIA_KINDS.includes(type)) return {}
  const part = m[type] as { id?: unknown; mime_type?: unknown } | undefined
  const id = str(part?.id)
  if (!id) return {}
  return { mediaId: id, mediaKind: type, mediaMime: str(part?.mime_type) || null }
}

/** The text of a reply, whatever shape it arrived in. */
function textOf(m: Record<string, unknown>): string {
  const type = str(m.type)
  if (type === 'text') return str((m.text as { body?: unknown })?.body)
  if (type === 'button') return str((m.button as { text?: unknown })?.text)
  if (type === 'interactive') {
    const i = m.interactive as { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } }
    return str(i?.button_reply?.title ?? i?.list_reply?.title)
  }
  // A picture or a file may carry a caption, which is the only words there
  // are. A payment screenshot usually has none.
  if (MEDIA_KINDS.includes(type as MediaKind)) {
    const part = m[type] as { caption?: unknown } | undefined
    return str(part?.caption) || `[${type}]`
  }
  // An image, a voice note, a location. There is nothing to read, but the
  // fact that they answered at all is worth keeping.
  return type ? `[${type}]` : ''
}

/**
 * Everything worth keeping out of one webhook payload.
 *
 * Meta nests three levels deep and may batch several events in one request.
 * Anything unrecognised is ignored rather than throwing: a webhook that 500s
 * gets retried and then switched off by Meta.
 */
export function parseEvents(payload: unknown): { statuses: StatusEvent[]; messages: InboundMessage[] } {
  const statuses: StatusEvent[] = []
  const messages: InboundMessage[] = []

  const entries = (payload as { entry?: unknown })?.entry
  if (!Array.isArray(entries)) return { statuses, messages }

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value
      if (!value) continue

      for (const s of (Array.isArray(value.statuses) ? value.statuses : []) as Record<string, unknown>[]) {
        const status = str(s.status).toLowerCase()
        if (!['sent', 'delivered', 'read', 'failed'].includes(status)) continue
        const errors = Array.isArray(s.errors) ? (s.errors as Record<string, unknown>[]) : []
        const first = errors[0]
        statuses.push({
          messageId: str(s.id),
          status: status as DeliveryStatus,
          to: str(s.recipient_id),
          error: first ? str(first.title || first.message || first.code) || null : null,
          at: stamp(s.timestamp),
        })
      }

      for (const m of (Array.isArray(value.messages) ? value.messages : []) as Record<string, unknown>[]) {
        const body = textOf(m)
        if (!str(m.id)) continue
        messages.push({
          messageId: str(m.id),
          from: str(m.from),
          body,
          ...mediaOf(m),
          at: stamp(m.timestamp),
        })
      }
    }
  }

  return { statuses, messages }
}

// Waiting states sit below 'sent' so a delivery report can lift a row that
// was only ever recorded as pending.
const RANK: Record<string, number> = {
  held: 1, pending: 1, sent: 2, failed: 3, delivered: 4, read: 5,
}

/**
 * The status to keep when a report arrives.
 *
 * Forwards only. 'delivered' can land after 'read' on a slow connection, and a
 * message that was read must not go back to merely delivered. A 'failed' after
 * 'sent' is real news; a 'failed' after 'read' is not.
 */
export function betterStatus(current: string, incoming: DeliveryStatus): string {
  const a = RANK[String(current ?? '').toLowerCase()] ?? 0
  const b = RANK[incoming] ?? 0
  return b > a ? incoming : current
}

/**
 * The member a reply came from.
 *
 * Matched on the last ten digits, because a number is stored canonically here
 * (v107) and arrives from Meta with its country code. Two members sharing a
 * number — a husband and wife on one phone, which happens — gives no match
 * rather than the wrong one: being told 'somebody on this number said paid' is
 * useful, being told the wrong name is not.
 */
export function matchMemberByPhone<T extends { id: string; phone?: string | null }>(
  from: string,
  members: readonly T[],
): T | null {
  const tail = String(from ?? '').replace(/\D/g, '').slice(-10)
  if (tail.length < 10) return null
  const hits = members.filter(m => String(m.phone ?? '').replace(/\D/g, '').slice(-10) === tail)
  return hits.length === 1 ? hits[0] : null
}

/** 'paid', 'done', 'transferred' — a reply that may be a claim to have paid. */
const PAID_WORDS = /\b(paid|payment done|done|sent|transferred|credited)\b/i

/**
 * Words that turn a claim into its opposite.
 *
 * 'not paid yet' contains 'paid'. Without this the flag would be worse than
 * useless — it would mark the people who have told you plainly that they have
 * NOT paid. A sentence carrying any of these is left unflagged, which errs
 * towards making the operator read it.
 */
const NOT_YET = /\b(not|no|never|yet|haven'?t|hasn'?t|didn'?t|won'?t|cannot|can'?t|will|shall|tomorrow|next)\b/i

/**
 * Whether a reply looks like a claim to have paid.
 *
 * A guess, deliberately shown as a guess: it marks the reply for the operator
 * to check against the collection, and never records a payment by itself.
 * Nobody's books should move because somebody typed 'ok'.
 */
export function looksLikePaid(body: string): boolean {
  const text = String(body ?? '')
  if (NOT_YET.test(text)) return false
  return PAID_WORDS.test(text)
}

/** 'STOP' and the rest. A member asking not to be messaged again. */
export function looksLikeStop(body: string): boolean {
  return /^\s*(stop|unsubscribe|stop messages?|do not message)\s*$/i.test(String(body ?? ''))
}
