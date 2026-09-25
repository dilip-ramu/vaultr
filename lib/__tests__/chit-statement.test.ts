// The monthly partner statement.
//
// Ten partners will read this document and one of them owns the app. If a
// figure in it is wrong, the cost is not a bug report — it is an argument about
// money between people who work together. So the arithmetic is asserted from
// several directions, including the ones that would let a mistake look tidy.

import { describe, it, expect } from 'vitest'
import {
  buildStatement, balanceChecks, effectOn, monthPeriod, lastCompletedMonth,
  selectableMonths, lastDayOfMonth, periodLabelFor, money, signed, nameOf,
  type StatementInput, type StatementTxn,
} from '@/lib/chit/statement'

const ACC = 'acc-unyra'

function txn(p: Partial<StatementTxn> & { id: string; date: string; amount: number }): StatementTxn {
  return {
    type: 'income', account_id: ACC, to_account_id: null, name: p.id,
    ...p,
  } as StatementTxn
}

function input(over: Partial<StatementInput> = {}): StatementInput {
  return {
    accountId: ACC,
    accountName: 'Unyra Capital',
    initialBalance: 0,
    recordedBalance: null,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    txns: [],
    collections: [],
    auctions: [],
    groups: [],
    memberNames: {},
    rosterByGroup: {},
    ...over,
  }
}

/* ── Periods ─────────────────────────────────────────────────────────────── */

describe('periods', () => {
  it('knows how long a month is, including February in a leap year', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28)
    expect(lastDayOfMonth(2028, 2)).toBe(29)
    expect(lastDayOfMonth(2026, 8)).toBe(31)
    expect(lastDayOfMonth(2026, 9)).toBe(30)
  })

  it('builds a whole calendar month from its key', () => {
    expect(monthPeriod('2026-08')).toEqual({
      start: '2026-08-01', end: '2026-08-31', label: 'August 2026', key: '2026-08',
    })
  })

  it('gives the previous month, which is what you send on the 1st', () => {
    expect(lastCompletedMonth('2026-09-01').key).toBe('2026-08')
    expect(lastCompletedMonth('2026-09-25').key).toBe('2026-08')
  })

  it('crosses the new year backwards without landing on month zero', () => {
    const p = lastCompletedMonth('2027-01-01')
    expect(p.key).toBe('2026-12')
    expect(p.label).toBe('December 2026')
  })

  it('offers a run of months with no gaps and no repeats', () => {
    const months = selectableMonths('2026-09-25', 14)
    expect(months[0].key).toBe('2026-09')
    expect(months[13].key).toBe('2025-08')
    expect(new Set(months.map(m => m.key)).size).toBe(14)
  })

  it('labels a whole month by name and anything else by its dates', () => {
    expect(periodLabelFor('2026-08-01', '2026-08-31')).toBe('August 2026')
    expect(periodLabelFor('2026-08-01', '2026-08-30')).toBe('1 Aug 2026 to 30 Aug 2026')
  })
})

/* ── Which way the money went ────────────────────────────────────────────── */

describe('the effect of a transaction on this account', () => {
  it('adds income and subtracts expense', () => {
    expect(effectOn(txn({ id: 'a', date: '2026-08-01', amount: 500, type: 'income' }), ACC)).toBe(500)
    expect(effectOn(txn({ id: 'b', date: '2026-08-01', amount: 500, type: 'expense' }), ACC)).toBe(-500)
  })

  it('counts a transfer out of this account and into it', () => {
    const out = txn({ id: 'c', date: '2026-08-01', amount: 200, type: 'transfer', to_account_id: 'other' })
    expect(effectOn(out, ACC)).toBe(-200)
    const into = txn({ id: 'd', date: '2026-08-01', amount: 200, type: 'transfer', account_id: 'other', to_account_id: ACC })
    expect(effectOn(into, ACC)).toBe(200)
  })

  it('ignores a transaction that has nothing to do with this account', () => {
    expect(effectOn(txn({ id: 'e', date: '2026-08-01', amount: 900, account_id: 'other' }), ACC)).toBe(0)
  })
})

/* ── The arithmetic the statement puts in front of partners ──────────────── */

describe('the balance', () => {
  const base = input({
    initialBalance: 10_000,
    txns: [
      txn({ id: 'before', date: '2026-07-20', amount: 5_000, type: 'income' }),
      txn({ id: 'c1', date: '2026-08-05', amount: 2_000, type: 'income' }),
      txn({ id: 'c2', date: '2026-08-06', amount: 3_000, type: 'income' }),
      txn({ id: 'p1', date: '2026-08-10', amount: 4_000, type: 'expense' }),
      txn({ id: 'after', date: '2026-09-02', amount: 1_000, type: 'income' }),
    ],
    collections: [
      { group_id: 'g1', member_id: 'm1', month_number: 3, amount: 2_000, paid_date: '2026-08-05', income_transaction_id: 'c1' },
      { group_id: 'g1', member_id: 'm2', month_number: 3, amount: 3_000, paid_date: '2026-08-06', income_transaction_id: 'c2' },
    ],
    auctions: [
      { group_id: 'g1', month_number: 3, auction_date: '2026-08-09', winner_member_id: 'm1', bid_amount: 6_000, commission: 1_000, net_payout: 4_000, dividend_per_member: 250, payout_transaction_id: 'p1' },
    ],
  })

  it('opens with everything that happened before the period, and nothing inside it', () => {
    expect(buildStatement(base).opening).toBe(15_000)
  })

  it('closes with the period applied and the future left out', () => {
    const s = buildStatement(base)
    expect(s.moneyIn).toBe(5_000)
    expect(s.moneyOut).toBe(4_000)
    expect(s.closing).toBe(16_000)
  })

  it('states arithmetic that actually adds up', () => {
    for (const c of balanceChecks(buildStatement(base))) {
      expect(c.ok, c.label).toBe(true)
    }
  })

  it('splits chit money from everything else', () => {
    const s = buildStatement(base)
    expect(s.collectionsIn).toBe(5_000)
    expect(s.payoutsOut).toBe(4_000)
    expect(s.otherIn).toBe(0)
    expect(s.otherOut).toBe(0)
  })

  it('lists every transaction in the period, in date order, with a running balance', () => {
    const s = buildStatement(base)
    expect(s.lines.map(l => l.id)).toEqual(['c1', 'c2', 'p1'])
    expect(s.lines.map(l => l.running)).toEqual([17_000, 20_000, 16_000])
    expect(s.lines[s.lines.length - 1].running).toBe(s.closing)
  })

  it('leaves out transactions belonging to a different account', () => {
    const s = buildStatement(input({
      txns: [txn({ id: 'x', date: '2026-08-04', amount: 9_999, account_id: 'someone-else' })],
    }))
    expect(s.lines).toEqual([])
    expect(s.closing).toBe(0)
  })
})

/* ── The rows a partner most wants explained ─────────────────────────────── */

describe('transactions that are not chit money', () => {
  const s = buildStatement(input({
    txns: [
      txn({ id: 'c1', date: '2026-08-05', amount: 2_000, type: 'income' }),
      txn({ id: 'fee', date: '2026-08-07', amount: 350, type: 'expense', name: 'Bank charges' }),
      txn({ id: 'mystery', date: '2026-08-12', amount: 50_000, type: 'transfer', to_account_id: 'personal' }),
    ],
    collections: [
      { group_id: 'g1', member_id: 'm1', month_number: 1, amount: 2_000, paid_date: '2026-08-05', income_transaction_id: 'c1' },
    ],
  }))

  it('marks them Other rather than quietly folding them into the chit totals', () => {
    expect(s.lines.find(l => l.id === 'fee')!.kind).toBe('other')
    expect(s.lines.find(l => l.id === 'mystery')!.kind).toBe('other')
    expect(s.collectionsIn).toBe(2_000)
    expect(s.otherOut).toBe(50_350)
  })

  it('says in words that they exist, so nobody has to notice on their own', () => {
    expect(s.notes.join(' ')).toContain('not a chit collection or payout')
  })

  it('still adds up once they are included', () => {
    for (const c of balanceChecks(s)) expect(c.ok, c.label).toBe(true)
  })

  it('says so plainly when there are none', () => {
    const clean = buildStatement(input({
      txns: [txn({ id: 'c1', date: '2026-08-05', amount: 2_000 })],
      collections: [{ group_id: 'g1', member_id: 'm1', month_number: 1, amount: 2_000, paid_date: '2026-08-05', income_transaction_id: 'c1' }],
    }))
    expect(clean.notes.join(' ')).toContain('Every transaction in this period is a chit collection or a chit payout')
  })
})

describe('a transaction that was renamed', () => {
  it('is still a collection, because a chit row points at it', () => {
    const s = buildStatement(input({
      txns: [txn({ id: 'c1', date: '2026-08-05', amount: 2_000, name: 'misc credit' })],
      collections: [{ group_id: 'g1', member_id: 'm1', month_number: 1, amount: 2_000, paid_date: '2026-08-05', income_transaction_id: 'c1' }],
    }))
    expect(s.lines[0].kind).toBe('collection')
    expect(s.otherIn).toBe(0)
  })
})

/* ── Money the books claim but the bank has not seen ─────────────────────── */

describe('gaps between the chit books and the account', () => {
  it('names collections recorded with no transaction behind them', () => {
    const s = buildStatement(input({
      collections: [{ group_id: 'g1', member_id: 'm1', month_number: 1, amount: 7_500, paid_date: '2026-08-05', income_transaction_id: null }],
    }))
    expect(s.notes.join(' ')).toContain('no matching transaction in this account')
    expect(s.notes.join(' ')).toContain('₹7,500')
    expect(s.closing).toBe(0)   // and it is NOT counted in the balance
  })

  it('names auctions held but not yet paid out', () => {
    const s = buildStatement(input({
      auctions: [{ group_id: 'g1', month_number: 2, auction_date: '2026-08-09', winner_member_id: 'm1', bid_amount: 6_000, commission: 1_000, net_payout: 44_000, dividend_per_member: 250, payout_transaction_id: null }],
    }))
    expect(s.notes.join(' ')).toContain('not yet paid out')
    expect(s.notes.join(' ')).toContain('₹44,000')
  })
})

/* ── Cross-checking against what Inex itself holds ───────────────────────── */

describe('the cross-check against the app\'s own balance', () => {
  const txns = [txn({ id: 'c1', date: '2026-08-05', amount: 2_000 })]

  it('compares when nothing has moved since the period ended', () => {
    const s = buildStatement(input({ txns, recordedBalance: 2_000 }))
    expect(s.recordedBalance).toBe(2_000)
    expect(s.difference).toBe(0)
  })

  it('flags a disagreement in words rather than burying it', () => {
    const s = buildStatement(input({ txns, recordedBalance: 2_500 }))
    expect(s.difference).toBe(500)
    expect(s.notes.join(' ')).toContain('needs explaining')
  })

  it('refuses to compare when the account has moved since — that proves nothing', () => {
    const s = buildStatement(input({
      txns: [...txns, txn({ id: 'later', date: '2026-09-03', amount: 900 })],
      recordedBalance: 2_900,
    }))
    expect(s.difference).toBeNull()
    expect(s.recordedBalance).toBeNull()
    expect(s.notes.join(' ')).toContain('not today')
  })
})

/* ── Per group ───────────────────────────────────────────────────────────── */

describe('each group', () => {
  const groups = [{ id: 'g1', name: 'UC Gold 5L', chit_value: 500_000, members: 25, status: 'active' }]
  const memberNames = {
    m1: { name: 'Lokesh S', code: 'UC00001' },
    m2: { name: 'Ramesh K', code: 'UC00002' },
  }

  it('reports the auction held in the period, with the winner named', () => {
    const s = buildStatement(input({
      groups, memberNames,
      rosterByGroup: { g1: ['m1', 'm2'] },
      auctions: [{ group_id: 'g1', month_number: 4, auction_date: '2026-08-09', winner_member_id: 'm1', bid_amount: 60_000, commission: 25_000, net_payout: 440_000, dividend_per_member: 1_400, payout_transaction_id: 'p1' }],
      txns: [txn({ id: 'p1', date: '2026-08-09', amount: 440_000, type: 'expense' })],
    }))
    const g = s.groups[0]
    expect(g.auction!.winner).toBe('Lokesh S (UC00001)')
    expect(g.auction!.monthNumber).toBe(4)
    expect(g.auction!.paid).toBe(true)
    expect(g.payoutTotal).toBe(440_000)
  })

  it('owes nothing for a month whose auction has not been held', () => {
    const s = buildStatement(input({
      groups, memberNames, rosterByGroup: { g1: ['m1', 'm2'] },
      auctions: [],   // nothing has run
    }))
    expect(s.groups[0].outstanding).toBe(0)
  })

  it('counts only the members who did not pay a month that HAS run', () => {
    const s = buildStatement(input({
      groups, memberNames, rosterByGroup: { g1: ['m1', 'm2'] },
      auctions: [{ group_id: 'g1', month_number: 1, auction_date: '2026-08-09', winner_member_id: 'm1', bid_amount: 0, commission: 0, net_payout: 0, dividend_per_member: 1_000, payout_transaction_id: null }],
      collections: [{ group_id: 'g1', member_id: 'm1', month_number: 1, amount: 19_000, paid_date: '2026-08-10', income_transaction_id: null }],
    }))
    // installment = 500000/25 = 20000; due = 20000 - 1000 = 19000. m1 paid, m2 did not.
    expect(s.groups[0].installment).toBe(20_000)
    expect(s.groups[0].outstandingCount).toBe(1)
    expect(s.groups[0].outstanding).toBe(19_000)
  })

  it('does not count an auction held after the period end', () => {
    const s = buildStatement(input({
      groups, memberNames, rosterByGroup: { g1: ['m1', 'm2'] },
      auctions: [{ group_id: 'g1', month_number: 2, auction_date: '2026-09-09', winner_member_id: 'm2', bid_amount: 0, commission: 0, net_payout: 0, dividend_per_member: 0, payout_transaction_id: null }],
    }))
    expect(s.groups[0].auction).toBeNull()
    expect(s.groups[0].outstanding).toBe(0)
  })
})

/* ── An empty month still has to say something ───────────────────────────── */

describe('a month with no movement', () => {
  it('says so, and carries the balance through unchanged', () => {
    const s = buildStatement(input({
      initialBalance: 42_000,
      txns: [txn({ id: 'old', date: '2026-06-01', amount: 8_000 })],
    }))
    expect(s.opening).toBe(50_000)
    expect(s.closing).toBe(50_000)
    expect(s.lines).toEqual([])
    expect(s.notes.join(' ')).toContain('No money moved')
  })
})

/* ── Presentation helpers the document depends on ────────────────────────── */

describe('how figures are written', () => {
  it('uses Indian grouping', () => {
    expect(money(4_50_000)).toBe('₹4,50,000')
    expect(money(1_00_00_000)).toBe('₹1,00,00,000')
  })

  it('shows direction with a real minus sign, not a hyphen', () => {
    expect(signed(-500)).toBe('−₹500')
    expect(signed(500)).toBe('+₹500')
    expect(signed(0)).toBe('₹0')
  })

  it('never prints a blank where a member should be', () => {
    expect(nameOf({}, 'ghost')).toBe('Unknown member')
    expect(nameOf({ m: { name: 'Asha', code: null } }, 'm')).toBe('Asha')
  })
})
