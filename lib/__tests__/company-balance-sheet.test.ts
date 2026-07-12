import { describe, it, expect } from 'vitest'
import {
  buildBalanceSheet, unassignedSheet, isLiabilityAccount,
  type SheetAccount, type SheetAsset, type SheetReceivable, type SheetPayable,
} from '@/lib/companies/balanceSheet'

const A = 'company-a'
const B = 'company-b'

const accounts: SheetAccount[] = [
  { id: '1', name: 'HDFC current', type: 'checking', companyId: A, balance: 500000 },
  { id: '2', name: 'Petty cash',   type: 'cash',     companyId: A, balance: 20000 },
  { id: '3', name: 'HDFC card',    type: 'credit',   companyId: A, balance: -45000 },
  { id: '4', name: 'Machine loan', type: 'loan',     companyId: A, balance: -300000 },
  { id: '5', name: 'ICICI current', type: 'checking', companyId: B, balance: 100000 },
  { id: '6', name: 'Personal savings', type: 'savings', companyId: null, balance: 250000 },
]

const assets: SheetAsset[] = [
  { id: 'a1', name: 'Embroidery machine', category: 'machinery', companyId: A, value: 400000, status: 'held' },
  { id: 'a2', name: 'Old press',          category: 'machinery', companyId: A, value: 50000,  status: 'sold' },
  { id: 'a3', name: 'Gold',               category: 'gold',      companyId: null, value: 900000, status: 'held' },
]

const receivables: SheetReceivable[] = [
  { id: 'r1', number: 'L-2600001', party: 'Amaravathi', companyId: A, outstanding: 118000 },
  { id: 'r2', number: 'L-2600002', party: 'Paid Co',    companyId: A, outstanding: 0 },
  { id: 'r3', number: 'C-2600001', party: 'Other',      companyId: B, outstanding: 50000 },
]

const payables: SheetPayable[] = [
  { id: 'p1', number: 'DHL-1', party: 'DHL', companyId: A, outstanding: 30000 },
  { id: 'p2', number: 'DHL-2', party: 'DHL', companyId: A, outstanding: 0 },
]

const data = { accounts, assets, receivables, payables }

describe('liability accounts', () => {
  it('knows a card and a loan are debts, and a current account is not', () => {
    expect(isLiabilityAccount({ type: 'credit' })).toBe(true)
    expect(isLiabilityAccount({ type: 'loan' })).toBe(true)
    expect(isLiabilityAccount({ type: 'checking' })).toBe(false)
    expect(isLiabilityAccount({ type: 'cash' })).toBe(false)
  })
})

describe('company balance sheet', () => {
  const sheet = buildBalanceSheet(A, data)

  it('counts only cash accounts as cash — a card balance is not negative cash', () => {
    expect(sheet.cash).toBe(520000)          // 500000 + 20000, card and loan excluded
  })

  // THE TRAP: a card reading −45,000 means you OWE 45,000. Adding that raw
  // balance into cash would understate cash AND lose the debt entirely.
  it('reports debt as a positive number owed, not a negative balance', () => {
    expect(sheet.debt).toBe(345000)          // 45000 card + 300000 loan
  })

  it('values assets still held, and drops the ones already sold', () => {
    expect(sheet.assets).toBe(400000)        // the sold press is NOT counted
    expect(sheet.counts.assets).toBe(1)
  })

  it('counts only invoices with something still outstanding', () => {
    expect(sheet.receivables).toBe(118000)
    expect(sheet.counts.receivables).toBe(1)
  })

  it('counts only bills with something still owed', () => {
    expect(sheet.payables).toBe(30000)
    expect(sheet.counts.payables).toBe(1)
  })

  it('nets it all out: own minus owe', () => {
    // 400000 assets + 520000 cash + 118000 receivable − 345000 debt − 30000 payable
    expect(sheet.net).toBe(663000)
  })

  it('never mixes one company into another', () => {
    const b = buildBalanceSheet(B, data)
    expect(b.cash).toBe(100000)
    expect(b.assets).toBe(0)
    expect(b.receivables).toBe(50000)
    expect(b.debt).toBe(0)
    expect(b.net).toBe(150000)
  })
})

describe('unassigned bucket', () => {
  const sheet = unassignedSheet(data)

  it('collects everything tagged to no company — which is how you find what you forgot', () => {
    expect(sheet.cash).toBe(250000)
    expect(sheet.assets).toBe(900000)
    expect(sheet.net).toBe(1150000)
  })
})

describe('a company with nothing', () => {
  it('is all zeroes rather than NaN', () => {
    const sheet = buildBalanceSheet('empty', data)
    expect(sheet.cash).toBe(0)
    expect(sheet.assets).toBe(0)
    expect(sheet.debt).toBe(0)
    expect(sheet.net).toBe(0)
    expect(sheet.counts.accounts).toBe(0)
  })
})

describe('an overdrawn current account', () => {
  it('reduces cash rather than being counted as a loan', () => {
    const od: SheetAccount[] = [{ id: 'x', name: 'OD', type: 'checking', companyId: A, balance: -10000 }]
    const sheet = buildBalanceSheet(A, { accounts: od, assets: [], receivables: [], payables: [] })
    expect(sheet.cash).toBe(-10000)
    expect(sheet.debt).toBe(0)
    expect(sheet.net).toBe(-10000)
  })
})

// An asset bought from a transaction must not be double-counted: the expense
// already left the account (so cash is lower), and the asset now stands in its
// place. Net position is unchanged by the purchase itself — that's the whole
// point of calling it an asset rather than a cost.
describe('buying an asset with money from an account', () => {
  it('leaves the net position unchanged — cash became a thing you own', () => {
    const before = buildBalanceSheet(A, {
      accounts: [{ id: 'c', name: 'Current', type: 'checking', companyId: A, balance: 500000 }],
      assets: [], receivables: [], payables: [],
    })

    // Spend 400000 on a machine: cash drops, the asset appears.
    const after = buildBalanceSheet(A, {
      accounts: [{ id: 'c', name: 'Current', type: 'checking', companyId: A, balance: 100000 }],
      assets: [{ id: 'm', name: 'Machine', category: 'machinery', companyId: A, value: 400000, status: 'held' }],
      receivables: [], payables: [],
    })

    expect(before.net).toBe(500000)
    expect(after.net).toBe(500000)      // not 100000 — the machine is still yours
    expect(after.cash).toBe(100000)
    expect(after.assets).toBe(400000)
  })
})
