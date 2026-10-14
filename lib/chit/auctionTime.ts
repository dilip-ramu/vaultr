// What time the auction starts, written the way a member reads it.
//
// The database holds '18:30'. A notice on WhatsApp should say 6:30 PM, because
// that is what people say out loud. Neither form should be typed by hand into
// the other — that is how the notice ended up permanently claiming 6:30 PM for
// every group regardless of when it actually met.
//
// Pure. A notice that states the wrong time is worse than one that states none,
// so this is tested rather than eyeballed.

/** '18:30:00' or '18:30' → '6:30 PM'. Anything unusable → null. */
export function formatAuctionTime(value: string | null | undefined): string | null {
  const parsed = parseAuctionTime(value)
  if (!parsed) return null
  const { hour, minute } = parsed
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}

/** The value an <input type="time"> wants: '18:30'. */
export function toTimeInput(value: string | null | undefined): string {
  const parsed = parseAuctionTime(value)
  if (!parsed) return ''
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
}

/** What goes to the database, or null to clear it. */
export function toStoredTime(value: string | null | undefined): string | null {
  const parsed = parseAuctionTime(value)
  if (!parsed) return null
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:00`
}

/**
 * Accepts what the database returns and what a browser sends, which are not
 * quite the same thing — Postgres gives '18:30:00', an input gives '18:30'.
 * Refuses everything else rather than guessing: a silently wrong time in a
 * notice sends people to an empty room.
 */
export function parseAuctionTime(
  value: string | null | undefined,
): { hour: number; minute: number } | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null

  const hour = Number(m[1])
  const minute = Number(m[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  return { hour, minute }
}
