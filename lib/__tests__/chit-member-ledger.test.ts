// What a member owes, once "paid or not" stops being a good enough question.
//
// The case that prompted this: somebody hands over ₹20,000 against an ₹18,600
// due. Under the old model they were simply marked paid and the extra ₹1,400
// vanished into the bank with nothing pointing at it. Under this one it is
// credit, and next month they are asked for ₹1,400 less — only them.
//
// The arithmetic decides what people are asked to hand over, so it is tested
// from every direction, including the ones that would let an error look tidy.

import { describe, it, expect } from 'vitest'
import {
  memberLedger, creditPool, checkCreditMove, balanceWords, payable,
  type DueMonth, type PaidRow,
} from '@/lib/chit/memberLedger'

const dues = (...pairs: [number, number][]): DueMonth[] =>
  pairs.map(([month, due]) => ({ month, due }))
const paid = (...pairs: [number, number][]): PaidRow[] =>
  pairs.map(([month, amount]) => ({ month, amount }))

/* ── The ordinary case ───────────────────────────────────────────────────── */

describe('a member who pays exactly', () => {
  const l = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 18600], [2, 19000]))

  it('owes nothing and holds nothing', () => {
    expect(l.balance).toBe(0)
    expect(l.credit).toBe(0)
    expect(l.arrears).toBe(0)
  })

  it('marks every month paid', () => {
    expect(l.months.map(m => m.status)).toEqual(['paid', 'paid'])
  })
})

/* ── The case this was built for ─────────────────────────────────────────── */

describe('a member who overpaid by mistake', () => {
  // ₹20,000 handed over against an ₹18,600 due.
  const l = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 20000]))

  it('holds the extra as credit rather than losing it', () => {
    expect(l.months[0].carriedForward).toBe(1400)
  })

  it('asks them for less next month, by exactly the extra', () => {
    expect(l.months[1].due).toBe(19000)
    expect(l.months[1].broughtForward).toBe(1400)
    expect(l.months[1].payable).toBe(17600)
  })

  it('still shows them owing the reduced figure until they pay it', () => {
    expect(l.months[1].outstanding).toBe(17600)
    expect(l.arrears).toBe(17600)
  })

  it('settles exactly when they pay the reduced figure', () => {
    const settled = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 20000], [2, 17600]))
    expect(settled.balance).toBe(0)
    expect(settled.months[1].status).toBe('paid')
  })

  it('does not touch anybody else — this is one member\\u2019s ledger', () => {
    const other = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 18600]))
    expect(other.months[1].payable).toBe(19000)
  })
})

describe('a member who paid so far ahead that a month needs nothing', () => {
  const l = memberLedger(dues([1, 10000], [2, 10000], [3, 10000]), paid([1, 25000]))

  it('asks for nothing in the month the credit covers', () => {
    expect(l.months[1].payable).toBe(0)
    expect(l.months[1].paid).toBe(0)
  })

  it('calls that month covered, not paid and not unpaid', () => {
    // "Paid" would be a lie; "unpaid" would send somebody out to collect it.
    expect(l.months[1].status).toBe('covered')
  })

  it('carries what is left into the month after', () => {
    expect(l.months[2].broughtForward).toBe(5000)
    expect(l.months[2].payable).toBe(5000)
  })
})

/* ── Short payments, which were impossible to record before ──────────────── */

describe('a member who paid part of it', () => {
  const l = memberLedger(dues([1, 18600]), paid([1, 10000]))

  it('records what arrived and still shows the rest owing', () => {
    expect(l.months[0].paid).toBe(10000)
    expect(l.months[0].outstanding).toBe(8600)
    expect(l.months[0].status).toBe('part')
  })

  it('carries the shortfall into the next month rather than forgetting it', () => {
    const two = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 10000]))
    expect(two.arrears).toBe(27600)
    expect(two.months[1].broughtForward).toBe(0)
  })
})

describe('a member who paid twice in one month', () => {
  it('adds them up', () => {
    const l = memberLedger(dues([1, 18600]), paid([1, 10000], [1, 8600]))
    expect(l.months[0].paid).toBe(18600)
    expect(l.months[0].status).toBe('paid')
  })
})

/* ── Months that have not happened ───────────────────────────────────────── */

describe('months whose auction has not run', () => {
  it('owes nothing for them, because the dividend does not exist yet', () => {
    const l = memberLedger(dues([1, 18600]), paid([1, 18600]))
    expect(l.owedToDate).toBe(18600)
    expect(l.months).toHaveLength(1)
  })

  it('still counts money paid against them', () => {
    // Somebody paying three months ahead is not in arrears.
    const l = memberLedger(dues([1, 18600]), paid([1, 18600], [2, 19000]))
    expect(l.credit).toBe(19000)
    expect(l.arrears).toBe(0)
  })
})

/* ── Credit belongs to the member, not the group ─────────────────────────── */

describe('credit moved from one chit to another', () => {
  it('counts as money received in the chit it lands in', () => {
    const l = memberLedger(dues([1, 18600]), [], { creditIn: [{ month: 1, amount: 18600 }] })
    expect(l.months[0].creditApplied).toBe(18600)
    expect(l.months[0].payable).toBe(0)
    expect(l.months[0].status).toBe('paid')
  })

  it('leaves the chit it came out of', () => {
    const source = memberLedger(dues([1, 18600]), paid([1, 20000]), { creditOut: 1400 })
    expect(source.credit).toBe(0)
  })

  it('stops discounting the LATER months of the chit it left', () => {
    // The bug this caught: taking the credit off at the end of the walk left
    // every month in between still showing the reduced figure, so the member
    // got the same ₹1,400 off in both chits.
    const kept = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 20000]))
    expect(kept.months[1].payable).toBe(17600)

    const moved = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 20000]), { creditOut: 1400 })
    expect(moved.months[1].payable).toBe(19000)
  })

  it('cannot be spent twice', () => {
    // Out of A and into B: A has nothing left, B has it. The total is unchanged.
    const a = memberLedger(dues([1, 18600]), paid([1, 20000]), { creditOut: 1400 })
    const b = memberLedger(dues([1, 10000]), [], { creditIn: [{ month: 1, amount: 1400 }] })
    expect(a.credit + b.credit).toBe(0)
    expect(b.months[0].payable).toBe(8600)
  })

  it('reduces the month it was applied to, not an arbitrary one', () => {
    const l = memberLedger(
      dues([1, 10000], [2, 10000]), paid([1, 10000]),
      { creditIn: [{ month: 2, amount: 4000 }] },
    )
    expect(l.months[0].payable).toBe(10000)
    expect(l.months[1].payable).toBe(6000)
  })
})

describe('the credit a member is holding across their chits', () => {
  const pool = creditPool([
    { groupId: 'a', groupName: 'UC Gold',   balance: 1400 },
    { groupId: 'b', groupName: 'UC Silver', balance: -18600 },
    { groupId: 'c', groupName: 'UC Bronze', balance: 600 },
  ])

  it('adds up only what is actually spare', () => {
    expect(pool.available).toBe(2000)
  })

  it('does not net the arrears off against the credit', () => {
    // Being ahead in one chit and behind in another is two facts. Showing only
    // the difference would hide both.
    expect(pool.owing).toBe(18600)
  })

  it('says which chit each bit is sitting in, largest first', () => {
    expect(pool.from.map(f => f.groupName)).toEqual(['UC Gold', 'UC Bronze'])
  })

  it('refuses to move more than that chit is holding', () => {
    const r = checkCreditMove(pool, 'a', 'b', 2000)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('UC Gold')
  })

  it('refuses a chit with no credit, rather than taking it from another', () => {
    // "Not always the first chit" — the owner names the source, and a source
    // with nothing in it is an error, not a silent fallback.
    expect(checkCreditMove(pool, 'b', 'a', 100).ok).toBe(false)
  })

  it('refuses a move into the same chit it came from', () => {
    expect(checkCreditMove(pool, 'a', 'a', 100).ok).toBe(false)
  })

  it('refuses nothing and negatives', () => {
    expect(checkCreditMove(pool, 'a', 'b', 0).ok).toBe(false)
    expect(checkCreditMove(pool, 'a', 'b', -500).ok).toBe(false)
  })

  it('allows a move within what is there', () => {
    expect(checkCreditMove(pool, 'a', 'b', 1400).ok).toBe(true)
  })
})

/* ── How it reads ────────────────────────────────────────────────────────── */

describe('the one-line summary', () => {
  it('says credit, owing, or settled — never both', () => {
    expect(balanceWords({ credit: 1400, arrears: 0 })).toBe('₹1,400 in credit')
    expect(balanceWords({ credit: 0, arrears: 18600 })).toBe('₹18,600 owing')
    expect(balanceWords({ credit: 0, arrears: 0 })).toBe('Settled')
  })
})

describe('what to ask a member for', () => {
  it('is the payable figure for that month', () => {
    const l = memberLedger(dues([1, 18600], [2, 19000]), paid([1, 20000]))
    expect(payable(l, 2)).toBe(17600)
  })

  it('is nothing for a month that has not been auctioned', () => {
    const l = memberLedger(dues([1, 18600]), paid([1, 18600]))
    expect(payable(l, 9)).toBe(0)
  })
})

/* ── Rounding, which is where money bugs live ────────────────────────────── */

describe('rounding', () => {
  it('does not leave a stray paisa behind', () => {
    const l = memberLedger(dues([1, 16666.67], [2, 16666.67]), paid([1, 16666.67], [2, 16666.67]))
    expect(l.balance).toBe(0)
    expect(l.arrears).toBe(0)
  })
})
