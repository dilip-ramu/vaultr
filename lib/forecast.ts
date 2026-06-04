// ── 30-day cash forecast ─────────────────────────────────────────────────────
// Projects the next 30 days week by week from things the app already knows:
//   IN : unpaid customer invoices (due date), commission expected payments
//   OUT: unpaid supplier invoices, pending bills, unpaid payroll, card dues
// Items already overdue land in an "Overdue" bucket and are assumed to move
// this week. Starting point = today's combined bank balance (credit excluded).

export interface ForecastItem {
  label: string
  kind: 'customer_invoice' | 'commission' | 'supplier_invoice' | 'bill' | 'payroll' | 'card_due'
  date: string          // expected movement date (YYYY-MM-DD)
  amount: number        // positive number
  direction: 'in' | 'out'
}

export interface ForecastWeek {
  label: string         // "Overdue", "This week", "Week 2"…
  from: string
  to: string
  items: ForecastItem[]
  inflow: number
  outflow: number
  net: number
  projectedBalance: number  // running balance at end of bucket
  tight: boolean            // balance dips below zero
}

export interface Forecast {
  startingBalance: number
  weeks: ForecastWeek[]
  endBalance: number
  totalIn: number
  totalOut: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function addDays(d: string, days: number): string {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day + days))
  return dt.toISOString().split('T')[0]
}

/** Bucket boundaries: Overdue (< today), then 5 buckets covering today+0..29. */
export function buildForecast(opts: {
  startingBalance: number
  items: ForecastItem[]
  today: string
}): Forecast {
  const { startingBalance, items, today } = opts
  const horizon = addDays(today, 29)

  const buckets: { label: string; from: string; to: string }[] = [
    { label: 'Overdue', from: '0000-01-01', to: addDays(today, -1) },
  ]
  for (let i = 0; i < 5; i++) {
    const from = addDays(today, i * 7)
    if (from > horizon) break
    const to = i === 4 ? horizon : addDays(today, i * 7 + 6)
    buckets.push({ label: i === 0 ? 'This week' : `Week ${i + 1}`, from, to: to > horizon ? horizon : to })
  }

  // Keep only items inside the window (or overdue)
  const inWindow = items.filter(it => it.amount > 0 && it.date <= horizon)

  let running = startingBalance
  let totalIn = 0
  let totalOut = 0

  const weeks: ForecastWeek[] = buckets.map(b => {
    const its = inWindow
      .filter(it => it.date >= b.from && it.date <= b.to)
      .sort((a, x) => a.date.localeCompare(x.date))
    const inflow = round2(its.filter(i => i.direction === 'in').reduce((s, i) => s + i.amount, 0))
    const outflow = round2(its.filter(i => i.direction === 'out').reduce((s, i) => s + i.amount, 0))
    running = round2(running + inflow - outflow)
    totalIn += inflow
    totalOut += outflow
    return {
      label: b.label, from: b.from, to: b.to, items: its,
      inflow, outflow, net: round2(inflow - outflow),
      projectedBalance: running, tight: running < 0,
    }
  }).filter(w => w.items.length > 0 || w.label !== 'Overdue') // hide empty Overdue bucket

  return {
    startingBalance: round2(startingBalance),
    weeks,
    endBalance: running,
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
  }
}
