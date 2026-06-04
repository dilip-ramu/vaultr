import { describe, it, expect } from 'vitest'
import {
  lastStatementDate, statementDates, dueDateFor, debtAt, cardOverview,
  type CardTxn,
} from '../cards'

const CARD = 'card1'

function spend(amount: number, date: string): CardTxn {
  return { account_id: CARD, to_account_id: null, type: 'expense', amount, date }
}
function payment(amount: number, date: string): CardTxn {
  return { account_id: 'bank1', to_account_id: CARD, type: 'transfer', amount, date }
}
function refund(amount: number, date: string): CardTxn {
  return { account_id: CARD, to_account_id: null, type: 'income', amount, date }
}

describe('cycle dates', () => {
  it('last close is this month when the day has passed', () => {
    expect(lastStatementDate(15, '2026-06-20')).toBe('2026-06-15')
  })
  it('last close is previous month when the day is ahead', () => {
    expect(lastStatementDate(25, '2026-06-20')).toBe('2026-05-25')
  })
  it('close on the day itself counts', () => {
    expect(lastStatementDate(20, '2026-06-20')).toBe('2026-06-20')
  })
  it('statement day 31 clamps to short months', () => {
    expect(lastStatementDate(31, '2026-03-01')).toBe('2026-02-28')
  })
  it('walks history across year boundaries', () => {
    expect(statementDates(15, '2026-01-15', 3)).toEqual(['2026-01-15', '2025-12-15', '2025-11-15'])
  })
  it('due day after close lands in the same month', () => {
    expect(dueDateFor('2026-06-05', 25)).toBe('2026-06-25')
  })
  it('due day before close rolls to next month', () => {
    expect(dueDateFor('2026-06-15', 5)).toBe('2026-07-05')
  })
  it('due across year boundary', () => {
    expect(dueDateFor('2026-12-20', 10)).toBe('2027-01-10')
  })
})

describe('debtAt', () => {
  it('spends create debt, payments reduce it', () => {
    const txns = [spend(10000, '2026-05-20'), payment(4000, '2026-06-01')]
    expect(debtAt(CARD, 0, txns, '2026-05-31')).toBe(10000)
    expect(debtAt(CARD, 0, txns, '2026-06-02')).toBe(6000)
  })
  it('refunds reduce debt; overpayment shows zero debt', () => {
    const txns = [spend(1000, '2026-05-20'), refund(200, '2026-05-22'), payment(2000, '2026-05-25')]
    expect(debtAt(CARD, 0, txns, '2026-05-31')).toBe(0)
  })
})

describe('cardOverview', () => {
  // Cycle closes on the 15th, payment due on the 5th of next month
  const opts = {
    accountId: CARD, initialBalance: 0, statementDay: 15, dueDay: 5,
    today: '2026-06-20', historyMonths: 3, bankAmounts: {} as Record<string, number>,
  }

  it('statement amount = debt at close; window sums are right', () => {
    const txns = [
      spend(5000, '2026-05-20'),   // in cycle 16 May – 15 Jun
      spend(3000, '2026-06-10'),   // same cycle
      payment(5000, '2026-06-18'), // after close — pays the statement
      spend(1200, '2026-06-19'),   // current (open) cycle
    ]
    const o = cardOverview({ ...opts, txns })
    const latest = o.cycles[0]
    expect(latest.statementDate).toBe('2026-06-15')
    expect(latest.periodStart).toBe('2026-05-16')
    expect(latest.spends).toBe(8000)
    expect(latest.calculatedAmount).toBe(8000)
    expect(latest.dueDate).toBe('2026-07-05')
    expect(latest.paidSinceClose).toBe(5000)
    expect(latest.remainingDue).toBe(3000)
    expect(o.currentCycleSpend).toBe(1200)
  })

  it('hidden charges = bank figure − calculated figure', () => {
    const txns = [spend(8000, '2026-06-01')]
    const o = cardOverview({
      ...opts, txns,
      bankAmounts: { '2026-06-15': 8650 }, // bank added ₹650 of fees/interest
    })
    const latest = o.cycles[0]
    expect(latest.bankAmount).toBe(8650)
    expect(latest.hiddenCharges).toBe(650)
    expect(o.totalHiddenCharges).toBe(650)
    expect(o.cyclesWithBankAmount).toBe(1)
    // remaining due uses the bank's figure once entered
    expect(latest.remainingDue).toBe(8650)
  })

  it('no bank amount → hidden charges unknown (null), not zero', () => {
    const o = cardOverview({ ...opts, txns: [spend(100, '2026-06-01')] })
    expect(o.cycles[0].hiddenCharges).toBe(null)
    expect(o.totalHiddenCharges).toBe(0)
  })

  it('debt carries across cycles when not fully paid', () => {
    const txns = [
      spend(10000, '2026-04-20'),  // cycle closing 15 May
      payment(4000, '2026-05-20'), // partial payment
      spend(2000, '2026-06-01'),   // cycle closing 15 Jun
    ]
    const o = cardOverview({ ...opts, txns })
    expect(o.cycles[1].calculatedAmount).toBe(10000) // 15 May close
    expect(o.cycles[0].calculatedAmount).toBe(8000)  // 15 Jun: 10000 − 4000 + 2000
  })
})
