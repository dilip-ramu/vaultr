import { describe, it, expect } from './shim'
import { computeNetWorth, ownerLoanBalance, dashboardTiles } from '../lib/networth'
import type { SheetAccount, SheetAsset, SheetReceivable, SheetPayable } from '../lib/companies/balanceSheet'

const acct = (o: Partial<SheetAccount> & { id: string }): SheetAccount =>
  ({ name: o.id, type: 'savings', companyId: null, balance: 0, ...o })
const asset = (o: Partial<SheetAsset> & { id: string }): SheetAsset =>
  ({ name: o.id, category: 'gold', companyId: null, value: 0, status: 'held', ...o })
const recv = (o: Partial<SheetReceivable> & { id: string }): SheetReceivable =>
  ({ number: o.id, party: 'x', companyId: null, outstanding: 0, ...o })
const pay = (o: Partial<SheetPayable> & { id: string }): SheetPayable =>
  ({ number: o.id, party: 'x', companyId: null, outstanding: 0, ...o })

const A = { id: 'a', name: 'Company A', ownershipPct: 100 }
const B = { id: 'b', name: 'Company B', ownershipPct: 60 }

const base = {
  accounts: [] as SheetAccount[],
  assets: [] as SheetAsset[],
  receivables: [] as SheetReceivable[],
  payables: [] as SheetPayable[],
  companies: [] as typeof A[],
  loans: [] as { companyId: string; direction: 'lent' | 'repaid' | 'drawn' | 'returned'; amount: number }[],
}

describe('personal only', () => {
  it('is cash plus assets minus debt', () => {
    const nw = computeNetWorth({
      ...base,
      accounts: [acct({ id: 'hdfc', balance: 300000 }), acct({ id: 'card', type: 'credit', balance: -40000 })],
      assets: [asset({ id: 'gold', value: 200000 })],
    })
    expect(nw.personal.cash).toBe(300000)
    expect(nw.personal.debt).toBe(40000)
    expect(nw.grand).toBe(460000)   // 300k + 200k − 40k
  })
})

describe('the stake multiplies EQUITY, not each line', () => {
  // The trap: "60% of its cash" (₹60k) looks like a number you could spend.
  // You can't. The company owes ₹80k. Its equity is ₹20k and your share is ₹12k.
  it('a 60%-owned company deep in debt is worth 60% of what is LEFT', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [B],
      accounts: [acct({ id: 'b-bank', companyId: 'b', balance: 100000 })],
      payables: [pay({ id: 'bill', companyId: 'b', outstanding: 80000 })],
    })
    expect(nw.companies[0].equity).toBe(20000)
    expect(nw.business).toBe(12000)   // NOT 60,000
    expect(nw.grand).toBe(12000)
  })

  it('a company worth less than nothing drags you down, in proportion', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [B],
      payables: [pay({ id: 'bill', companyId: 'b', outstanding: 100000 })],
    })
    expect(nw.companies[0].equity).toBe(-100000)
    expect(nw.business).toBe(-60000)
  })

  it('a company you have fully exited contributes nothing', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [{ id: 'a', name: 'A', ownershipPct: 0 }],
      accounts: [acct({ id: 'a-bank', companyId: 'a', balance: 500000 })],
    })
    expect(nw.business).toBe(0)
  })
})

describe('invoicing yourself creates no wealth', () => {
  // A bills B ₹1L. THE bug this whole design exists to prevent: counting the
  // receivable AND the cash it will become, or counting inwards and outwards as
  // two separate additive tiles.
  const interCo = {
    ...base,
    companies: [A, { id: 'b', name: 'B', ownershipPct: 100 }],
    receivables: [recv({ id: 'inv1', companyId: 'a', outstanding: 100000 })],
    payables: [pay({ id: 'inv1', companyId: 'b', outstanding: 100000, interCompany: true })],
  }

  it('cancels exactly when you own both outright', () => {
    const nw = computeNetWorth(interCo)
    expect(nw.companies[0].yourShare).toBe(100000)   // A is owed
    expect(nw.companies[1].yourShare).toBe(-100000)  // B owes
    expect(nw.business).toBe(0)
    expect(nw.grand).toBe(0)
  })

  it('leaves you holding your partners’ share when you do not own both', () => {
    // You own all of A, 60% of B. B's partners owe 40% of that invoice.
    const nw = computeNetWorth({ ...interCo, companies: [A, B] })
    expect(nw.companies[0].yourShare).toBe(100000)
    expect(nw.companies[1].yourShare).toBe(-60000)
    expect(nw.business).toBe(40000)   // exactly your partners' 40%
  })
})

describe('owner loans are booked on BOTH sides', () => {
  it('lending your own 100% company money changes nothing — you moved a pocket', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [A],
      // The cash already left your personal account and sits in the company's.
      accounts: [acct({ id: 'a-bank', companyId: 'a', balance: 100000 })],
      loans: [{ companyId: 'a', direction: 'lent', amount: 100000 }],
    })
    expect(nw.ownerLoans).toBe(100000)        // it owes you
    expect(nw.companies[0].equity).toBe(0)    // …so its equity is nil
    expect(nw.grand).toBe(100000)             // = just the cash. Counted ONCE.
  })

  it('at 60%, your partners carry 40% of the debt to you', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [B],
      accounts: [acct({ id: 'b-bank', companyId: 'b', balance: 100000 })],
      loans: [{ companyId: 'b', direction: 'lent', amount: 100000 }],
    })
    expect(nw.ownerLoans).toBe(100000)
    expect(nw.companies[0].equity).toBe(0)
    expect(nw.grand).toBe(100000)  // the loan is yours in full; the equity is nil
  })

  it('nets lent against repaid, and drawings against returns', () => {
    const rows = [
      { companyId: 'a', direction: 'lent' as const, amount: 100000 },
      { companyId: 'a', direction: 'repaid' as const, amount: 30000 },
      { companyId: 'a', direction: 'drawn' as const, amount: 20000 },
      { companyId: 'a', direction: 'returned' as const, amount: 5000 },
      { companyId: 'b', direction: 'lent' as const, amount: 999999 },  // not this company
    ]
    expect(ownerLoanBalance(rows, 'a')).toBe(55000)  // 100 − 30 − 20 + 5
  })

  it('goes negative when you have taken more out than you put in', () => {
    expect(ownerLoanBalance([{ companyId: 'a', direction: 'drawn', amount: 40000 }], 'a')).toBe(-40000)
  })
})

describe('unknown is not zero', () => {
  // A company with no account is a company with no cash — you'd have made an
  // account if it had any. So this is NOT a warning: it's just zero. Crying
  // "unknown!" over every company at once is how a real warning gets ignored.
  it('a company with no accounts tagged is simply worth its assets, silently', () => {
    const nw = computeNetWorth({ ...base, companies: [A], assets: [asset({ id: 'g', companyId: 'a', value: 50000 })] })
    expect(nw.excluded).toEqual([])
    expect(nw.companies[0].yourShare).toBe(50000)
  })

  it('carries through exclusions it was handed — a stock with no price stays named', () => {
    const nw = computeNetWorth({
      ...base,
      excluded: [{ what: '200 GBP', why: 'no exchange rate' }],
    })
    expect(nw.grand).toBe(0)                 // the £200 is NOT counted…
    expect(nw.excluded[0].what).toBe('200 GBP')  // …but it is not forgotten either
  })
})

describe('untagged things are personal, and visible as such', () => {
  it('an asset tagged to no company lands in personal, not nowhere', () => {
    const nw = computeNetWorth({ ...base, companies: [A], assets: [asset({ id: 'g', value: 70000 })] })
    expect(nw.personal.assets).toBe(70000)
    expect(nw.grand).toBe(70000)
  })
})

describe('a sold asset is not an asset', () => {
  it('does not count the thing AND the money it became', () => {
    const nw = computeNetWorth({
      ...base,
      accounts: [acct({ id: 'bank', balance: 200000 })],   // the sale proceeds
      assets: [asset({ id: 'car', value: 200000, status: 'sold' })],
    })
    expect(nw.grand).toBe(200000)   // not 400,000
  })
})

describe('the dashboard tiles', () => {
  it('expose cash, assets and business separately — and they sum to the grand total', () => {
    const nw = computeNetWorth({
      ...base,
      companies: [B],
      accounts: [acct({ id: 'me', balance: 300000 }), acct({ id: 'b-bank', companyId: 'b', balance: 100000 })],
      assets: [asset({ id: 'gold', value: 200000 })],
    })
    const t = dashboardTiles(nw)
    expect(t.cash).toBe(300000)
    expect(t.assets).toBe(200000)
    expect(t.business).toBe(60000)
    expect(t.cash + t.assets + t.business + t.loans - t.debt).toBe(t.grand)
  })
})
