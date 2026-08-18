// India market dates (correctness pass, item 8). PURE.
//
// The Lab is an Indian-equity experiment run by a user in IST, executing on
// serverless infrastructure whose clock is UTC. Stamping a financial record with
// `new Date().toISOString().slice(0,10)` therefore books a 02:00 IST action
// against YESTERDAY. Every date the Lab persists must come from here instead.
//
// Two ways to decide which trading session a record belongs to:
//
//   1. PREFERRED — ask the market. Yahoo's chart meta carries regularMarketTime,
//      the timestamp of the last actual session. Its IST date IS the session
//      date: no holiday table to maintain, no weekend guesswork, and it is
//      self-correcting when the exchange has an unscheduled closure or a
//      special session (muhurat trading).
//   2. FALLBACK — the IST calendar, skipping weekends and known holidays. Used
//      only when no index timestamp could be fetched. It reports sessionKnown
//      = false when the holiday calendar for that year is incomplete, so the
//      caller can record the reduced data quality rather than pretend.
//
// Why it matters beyond tidiness: NAV rows are keyed by date, and the metrics
// module annualises with 252 trading days. Writing a row on a Saturday would
// add an observation with a guaranteed 0% return, which deflates measured
// volatility and inflates Sharpe — permanently, since NAV history is the
// experiment's record.

export const IST_OFFSET_MINUTES = 330      // UTC+5:30, no DST in India
export const TRADING_DAYS_PER_YEAR = 252

export interface IstParts {
  year: number; month: number; day: number
  hour: number; minute: number
  weekday: number                          // 0 = Sunday … 6 = Saturday
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Wall-clock parts in Asia/Kolkata for an instant. */
export function istParts(d: Date = new Date()): IstParts {
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  }
}

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDateString(d: Date = new Date()): string {
  const p = istParts(d)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** The IST calendar date of a unix timestamp in SECONDS (Yahoo's format). */
export function istDateFromEpochSeconds(sec: number): string {
  return istDateString(new Date(sec * 1000))
}

/** Day of week for a YYYY-MM-DD string. Date-only strings parse as UTC, which
 *  is what we want: the string already IS the IST date. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

export function isWeekend(dateStr: string): boolean {
  const w = weekdayOf(dateStr)
  return w === 0 || w === 6
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * NSE equity trading holidays that fall on a weekday.
 *
 * DELIBERATELY INCOMPLETE AND HONEST ABOUT IT. India's movable holidays (Holi,
 * the Eids, Diwali/Laxmi Pujan, Muhurat) are fixed by an NSE circular each year,
 * and a guessed date is worse than a known gap. Only years listed in
 * HOLIDAY_CALENDAR_COMPLETE are treated as authoritative; for any other year the
 * calendar fallback reports sessionKnown = false and the caller records the
 * degraded data quality.
 *
 * To update: copy the year's list from the NSE trading-holidays circular, add
 * the year to HOLIDAY_CALENDAR_COMPLETE, and add a test.
 */
export const NSE_HOLIDAYS: Record<string, string[]> = {
  // Fixed-date holidays only — the movable ones for these years have not been
  // transcribed from an authoritative circular, so the years stay "incomplete".
  '2026': ['2026-01-26', '2026-10-02', '2026-12-25'],
  '2027': ['2027-01-26', '2027-08-15', '2027-10-02'],
}

/** Years whose holiday list has been verified against the NSE circular. */
export const HOLIDAY_CALENDAR_COMPLETE: string[] = []

export function holidayCalendarKnown(year: number | string): boolean {
  return HOLIDAY_CALENDAR_COMPLETE.includes(String(year))
}

export function isKnownHoliday(dateStr: string): boolean {
  return (NSE_HOLIDAYS[dateStr.slice(0, 4)] ?? []).includes(dateStr)
}

/** Weekday and not a holiday we know about. */
export function isTradingDay(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isKnownHoliday(dateStr)
}

/** Walk back to the most recent trading day at or before dateStr. */
export function tradingDayOnOrBefore(dateStr: string, maxBack = 10): string {
  let d = dateStr
  for (let i = 0; i < maxBack; i++) {
    if (isTradingDay(d)) return d
    d = addDays(d, -1)
  }
  return d
}

export type TradingDateSource = 'index' | 'calendar'

export interface TradingDateResolution {
  /** The session date a record written now belongs to (YYYY-MM-DD, IST). */
  date: string
  source: TradingDateSource
  /** False when we had to guess from an incomplete holiday calendar. */
  sessionKnown: boolean
  /** True when "now" in IST is itself a trading day we recognise. */
  todayIsTradingDay: boolean
  note: string | null
}

/**
 * Which trading session does a record written *now* belong to?
 *
 * With an index timestamp: exactly the session the exchange last printed.
 * Without one: the most recent weekday that is not a known holiday — which
 * means a Saturday run updates Friday's row (idempotent by upsert) instead of
 * inventing a Saturday observation.
 */
export function resolveTradingDate(opts: {
  now?: Date
  indexMarketTimeSec?: number | null
} = {}): TradingDateResolution {
  const now = opts.now ?? new Date()
  const istToday = istDateString(now)
  const todayIsTradingDay = isTradingDay(istToday)

  const t = opts.indexMarketTimeSec
  if (t != null && Number.isFinite(t) && t > 0) {
    const date = istDateFromEpochSeconds(t)
    // Guard against a clearly bogus timestamp (clock skew / bad payload).
    if (date <= istToday && date >= addDays(istToday, -14)) {
      return {
        date, source: 'index', sessionKnown: true, todayIsTradingDay,
        note: date === istToday ? null : `Marked against the last completed session (${date}); today (${istToday}) has no print yet.`,
      }
    }
  }

  const date = tradingDayOnOrBefore(istToday)
  const known = holidayCalendarKnown(date.slice(0, 4))
  return {
    date,
    source: 'calendar',
    sessionKnown: known,
    todayIsTradingDay,
    note: known
      ? (date === istToday ? 'No index timestamp; used the IST calendar.' : `No index timestamp; rolled back to the previous trading day (${date}).`)
      : `No index timestamp and the ${date.slice(0, 4)} NSE holiday calendar is not verified — this session date is a calendar estimate.`,
  }
}
