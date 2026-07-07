// Period helpers shared between the server page and the client selector.
// Lives in lib/ (not inside a 'use client' file) so the server page can import
// `bounds` without dragging the client component into the server build.
//
// The period model mirrors the Dashboard exactly: Month · Quarter · Year ·
// Custom (same keys, same windows), so both pages behave identically.

export type PeriodKey = 'month' | 'quarter' | 'year' | 'custom'

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** India-standard financial year bounds (April 1 → March 31) containing `today`. */
export function fyBounds(today = new Date()): { start: string; end: string; label: string } {
  const y = today.getFullYear()
  const m = today.getMonth() // 0-indexed
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  // If today is Jan/Feb/Mar, we're in the FY that started April of last year.
  const fyStartYear = m < 3 ? y - 1 : y
  const start = fmt(new Date(fyStartYear, 3, 1))         // 1 April
  const end   = fmt(new Date(fyStartYear + 1, 2, 31))    // 31 March next year
  return { start, end, label: `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}` }
}

/** Compute YYYY-MM-DD start/end and an inclusive month count for the period.
 *  Windows match the Dashboard's period toggle exactly. */
export function bounds(
  period: PeriodKey,
  customFrom: string | null,
  customTo: string | null,
  today = new Date(),
): { from: string; to: string; label: string; months: number } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const y = today.getFullYear()
  const m = today.getMonth()

  if (period === 'quarter') {
    const q = Math.floor(m / 3)
    return {
      from: fmt(new Date(y, q * 3, 1)),
      to:   fmt(new Date(y, q * 3 + 3, 0)),
      label: `Q${q + 1} ${y}`,
      months: 3,
    }
  }
  if (period === 'year') {
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}`, months: 12 }
  }
  if (period === 'custom') {
    const f = customFrom || fmt(new Date(y, m, 1))
    const t = customTo   || fmt(today)
    const fd = new Date(f), td = new Date(t)
    const months = Math.max(1, (td.getFullYear() - fd.getFullYear()) * 12 + (td.getMonth() - fd.getMonth()) + 1)
    const short = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return { from: f, to: t, label: `${short(f)} – ${short(t)}`, months }
  }
  // month (default)
  return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)), label: `${MON[m]} ${y}`, months: 1 }
}
