import { describe, it, expect } from 'vitest'
import { buildForecast, type ForecastItem } from '../forecast'

const item = (over: Partial<ForecastItem>): ForecastItem => ({
  label: 'x', kind: 'bill', date: '2026-06-25', amount: 100, direction: 'out', ...over,
})

describe('buildForecast', () => {
  const today = '2026-06-20'

  it('projects the running balance week by week', () => {
    const f = buildForecast({
      startingBalance: 100000,
      today,
      items: [
        item({ direction: 'in', amount: 50000, date: '2026-06-22', kind: 'customer_invoice' }),
        item({ direction: 'out', amount: 80000, date: '2026-07-01', kind: 'payroll' }),
      ],
    })
    expect(f.startingBalance).toBe(100000)
    expect(f.endBalance).toBe(70000) // 100k + 50k − 80k
    expect(f.totalIn).toBe(50000)
    expect(f.totalOut).toBe(80000)
  })

  it('flags weeks where the balance goes negative', () => {
    const f = buildForecast({
      startingBalance: 10000,
      today,
      items: [item({ direction: 'out', amount: 50000, date: '2026-06-21', kind: 'card_due' })],
    })
    const thisWeek = f.weeks.find(w => w.label === 'This week')!
    expect(thisWeek.tight).toBe(true)
    expect(thisWeek.projectedBalance).toBe(-40000)
  })

  it('overdue items get their own bucket and count in the projection', () => {
    const f = buildForecast({
      startingBalance: 0,
      today,
      items: [item({ direction: 'in', amount: 7000, date: '2026-06-01', kind: 'customer_invoice' })],
    })
    expect(f.weeks[0].label).toBe('Overdue')
    expect(f.weeks[0].inflow).toBe(7000)
    expect(f.endBalance).toBe(7000)
  })

  it('items beyond 30 days are ignored', () => {
    const f = buildForecast({
      startingBalance: 0,
      today,
      items: [item({ direction: 'out', amount: 999, date: '2026-08-15' })],
    })
    expect(f.totalOut).toBe(0)
  })

  it('hides the Overdue bucket when nothing is overdue', () => {
    const f = buildForecast({ startingBalance: 0, today, items: [] })
    expect(f.weeks[0]?.label).toBe('This week')
  })
})
