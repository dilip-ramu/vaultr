// Sending a WhatsApp template through Meta's Cloud API.
//
// WHY THIS SHAPE
//
// Outside a 24-hour window opened by the member writing to you first, a
// business may send ONLY a pre-approved template. There is no free-form
// business-initiated message on WhatsApp at all, so this file sends templates
// and nothing else — the wording lives in Meta's approved template, and all we
// pass is the variables.
//
// Everything that can be decided without the network is separated from the
// call itself, so the payload is testable and the test suite never touches
// api.whatsapp.com.
//
// NOT CONFIGURED IS A NORMAL STATE, NOT AN ERROR. Until a business phone
// number is registered there is nothing to send with, and the caller is told
// that plainly rather than handed a failed request.

export interface CloudConfig {
  phoneNumberId: string
  token: string
  /** Graph API version, e.g. 'v21.0'. */
  version: string
}

/** Read from the environment. Returns null when the number is not live yet. */
export function cloudConfig(env: Record<string, string | undefined> = process.env): CloudConfig | null {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const token = env.WHATSAPP_TOKEN
  if (!phoneNumberId || !token) return null
  return { phoneNumberId, token, version: env.WHATSAPP_API_VERSION || 'v21.0' }
}

export interface TemplateSend {
  /** Digits only, with country code: '919876543210'. */
  to: string
  /** The approved template's name. */
  template: string
  /** Its approved language, e.g. 'en' or 'ta'. */
  language: string
  /**
   * Body variables in order, as {{1}}, {{2}}… Meta rejects a variable that is
   * empty or contains a newline or a tab, so they are checked before sending
   * rather than after a 400.
   */
  variables: readonly string[]
}

/** Why this send cannot be made, or null when it can. */
export function sendProblem(s: TemplateSend): string | null {
  // At least 11 digits, because a country code plus a national number cannot
  // be shorter: the mistake this catches is a bare 10-digit Indian mobile,
  // which Meta would deliver to somebody else entirely. Run numbers through
  // normalizeWhatsAppNumber in lib/whatsapp.ts first.
  if (!/^\d{11,15}$/.test(s.to)) return `'${s.to}' is not a phone number with a country code`
  if (!s.template.trim()) return 'No template name'
  if (!s.language.trim()) return 'No template language'
  for (const [i, v] of s.variables.entries()) {
    if (v == null || String(v).trim() === '') return `Variable ${i + 1} is empty — Meta rejects blank variables`
    if (/[\n\t]/.test(String(v))) return `Variable ${i + 1} contains a line break — Meta rejects those`
    // Meta's own limit on a single body variable.
    if (String(v).length > 1024) return `Variable ${i + 1} is too long`
  }
  return null
}

/** The exact JSON Meta expects. Pure, so it can be tested without sending. */
export function templatePayload(s: TemplateSend): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: s.to,
    type: 'template',
    template: {
      name: s.template,
      language: { code: s.language },
      components: s.variables.length
        ? [{ type: 'body', parameters: s.variables.map(text => ({ type: 'text', text: String(text) })) }]
        : [],
    },
  }
}

export function sendUrl(c: CloudConfig): string {
  return `https://graph.facebook.com/${c.version}/${c.phoneNumberId}/messages`
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; retryable: boolean }

/**
 * Whether failing this way is worth trying again later.
 *
 * A rejected template or a bad number will fail identically forever, and
 * retrying it burns the member's patience and Meta's quality rating. A rate
 * limit or a 500 is worth another go.
 */
export function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * How long is left of the window in which a free-form reply may be sent.
 *
 * WhatsApp allows a business to write whatever it likes for 24 hours after a
 * member writes to it. Outside that window only an approved template can be
 * sent, and Meta rejects anything else — which is the whole reason the app
 * needs to show the clock rather than let somebody type into a dead box.
 *
 * Measured from the LAST thing they sent, in minutes. Zero means closed.
 */
export function windowLeftMinutes(lastInboundAt: string | null | undefined, now: Date = new Date()): number {
  const t = Date.parse(String(lastInboundAt ?? ''))
  if (!Number.isFinite(t)) return 0
  const left = 24 * 60 - Math.floor((now.getTime() - t) / 60000)
  return left > 0 ? left : 0
}

/** '3 hours left to reply', '12 minutes left to reply', or why not. */
export function windowWords(lastInboundAt: string | null | undefined, now: Date = new Date()): string {
  const left = windowLeftMinutes(lastInboundAt, now)
  if (left <= 0) return 'More than a day since they wrote — only an approved message can be sent now.'
  if (left < 60) return `${left} minute${left === 1 ? '' : 's'} left to reply in your own words.`
  const hours = Math.floor(left / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} left to reply in your own words.`
}

export interface TextSend {
  /** Digits only, with country code. */
  to: string
  body: string
}

/** Why this reply cannot be sent, or null when it can. */
export function textProblem(s: TextSend): string | null {
  if (!/^\d{11,15}$/.test(s.to)) return `'${s.to}' is not a phone number with a country code`
  const body = String(s.body ?? '').trim()
  if (!body) return 'Nothing to send'
  // Meta's limit on a text message body.
  if (body.length > 4096) return 'Too long — keep it under 4096 characters'
  return null
}

export function textPayload(s: TextSend): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: s.to,
    type: 'text',
    // Links in a reply should preview, as they would in the app.
    text: { preview_url: true, body: String(s.body).trim() },
  }
}

/**
 * A reply in your own words.
 *
 * Only possible inside the 24-hour window — see windowLeftMinutes. Outside it
 * Meta refuses with a 'message outside window' error, which is passed back as
 * it comes rather than dressed up: the operator needs to know that the member
 * has to write first.
 */
export async function sendText(s: TextSend, config?: CloudConfig | null): Promise<SendResult> {
  const c = config ?? cloudConfig()
  if (!c) return { ok: false, error: 'WhatsApp is not configured yet — no business number registered', retryable: false }

  const problem = textProblem(s)
  if (problem) return { ok: false, error: problem, retryable: false }

  try {
    const res = await fetch(sendUrl(c), {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(textPayload(s)),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = (data as { error?: { message?: string; code?: number } }).error
      return {
        ok: false,
        error: err?.message ? `${err.message}${err.code ? ` (${err.code})` : ''}` : `HTTP ${res.status}`,
        retryable: isRetryable(res.status),
      }
    }
    const id = (data as { messages?: { id?: string }[] }).messages?.[0]?.id
    return id ? { ok: true, messageId: id } : { ok: false, error: 'Meta accepted it but returned no message id', retryable: false }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error', retryable: true }
  }
}

/** The one function here that touches the network. */
export async function sendTemplate(s: TemplateSend, config?: CloudConfig | null): Promise<SendResult> {
  const c = config ?? cloudConfig()
  if (!c) return { ok: false, error: 'WhatsApp is not configured yet — no business number registered', retryable: false }

  const problem = sendProblem(s)
  if (problem) return { ok: false, error: problem, retryable: false }

  try {
    const res = await fetch(sendUrl(c), {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload(s)),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = (data as { error?: { message?: string; code?: number } }).error
      return {
        ok: false,
        error: err?.message ? `${err.message}${err.code ? ` (${err.code})` : ''}` : `HTTP ${res.status}`,
        retryable: isRetryable(res.status),
      }
    }
    const id = (data as { messages?: { id?: string }[] }).messages?.[0]?.id
    return id ? { ok: true, messageId: id } : { ok: false, error: 'Meta accepted it but returned no message id', retryable: false }
  } catch (e) {
    // A network failure is worth retrying; a thrown error here is not a
    // rejection by Meta.
    return { ok: false, error: e instanceof Error ? e.message : 'Network error', retryable: true }
  }
}
