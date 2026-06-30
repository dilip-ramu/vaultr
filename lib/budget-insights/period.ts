// Period helpers shared between the server page and the client selector.
// Lives in lib/ (not inside a 'use client' file) so the server page can import
// `bounds` without dragging the client component into the server build.

export type PeriodKey = 'this_month' | 'last_month' | '3m' | '6m' | 'this_year' | 'all' | 'custom'

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom range',
}

/** Compute YYYY-MM-DD start/end and an inclusive month count for the period. */
export function bounds(
  period: PeriodKey,
  customFrom: string | null,
  customTo: string | null,
  today = new Date(),
): { from: string; to: string; label: string; months: number } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const y = today.getFullYear()
  const m = today.getMonth()
  const todayStr = fmt(today)
  if (period === 'all') {
    return { from: fmt(new Date(y - 5, 0, 1)), to: todayStr, label: 'All time', months: 60 }
  }
  if (period === 'this_month')  return { from: fmt(new Date(y, m, 1)),     to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL.this_month, months: 1 }
  if (period === 'last_month')  return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)),     label: PERIOD_LABEL.last_month, months: 1 }
  if (period === '3m')          return { from: fmt(new Date(y, m - 2, 1)), to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL['3m'],       months: 3 }
  if (period === '6m')          return { from: fmt(new Date(y, m - 5, 1)), to: fmt(new Date(y, m + 1, 0)), label: PERIOD_LABEL['6m'],       months: 6 }
  if (period === 'this_year')   return { from: fmt(new Date(y, 0, 1)),     to: fmt(new Date(y, 11, 31)),   label: `${y}`,                    months: 12 }
  const f = customFrom || fmt(new Date(y, m, 1))
  const t = customTo   || todayStr
  const fd = new Date(f), td = new Date(t)
  const ms = Math.max(1, (td.getFullYear() - fd.getFullYear()) * 12 + (td.getMonth() - fd.getMonth()) + 1)
  return { from: f, to: t, label: `${f} → ${t}`, months: ms }
}
