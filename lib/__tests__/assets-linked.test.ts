import { describe, it, expect } from 'vitest'
import {
  linkedTransactions, missingWords, nothingLinkedWords,
  type TxnRow, type LinkedInput,
} from '@/lib/assets/linked'

const row = (id: string, amount: number, date: string, name = 'Bill'): TxnRow => ({ id, amount, date, name })

const map = (...rows: TxnRow[]) => new Map(rows.map(r => [r.id, r]))

const base = (o: Partial<LinkedInput> = {}): LinkedInput => ({ byId: new Map(), ...o })

describe('what is attached to an asset', () => {
  it('finds the expense that bought it', () => {
    const l = linkedTransactions(base({
      purchaseTransactionId: 'p1',
      byId: map(row('p1', 2_000_000, '2019-06-01', 'Land purchase')),
    }))
    expect(l.groups[0]).toMatchObject({ reason: 'purchase', label: 'Bought with', total: 2_000_000 })
    expect(l.groups[0].txns[0].name).toBe('Land purchase')
  })

  it('finds the bills tagged to each improvement, kept apart', () => {
    const l = linkedTransactions(base({
      improvements: [
        { name: 'Compound wall', transaction_ids: ['a'] },
        { name: 'Borewell', transaction_ids: ['b', 'c'] },
      ],
      byId: map(row('a', 90000, '2021-02-02'), row('b', 40000, '2022-03-03'), row('c', 10000, '2022-04-04')),
    }))
    expect(l.groups.map(g => [g.label, g.total])).toEqual([
      ['Compound wall', 90000],
      ['Borewell', 50000],
    ])
  })

  it('finds the bills building up right now', () => {
    const l = linkedTransactions(base({
      bucketTxns: [row('x', 300000, '2026-03-01'), row('y', 150000, '2026-04-02')],
      byId: map(row('x', 300000, '2026-03-01'), row('y', 150000, '2026-04-02')),
    }))
    expect(l.groups[0]).toMatchObject({ reason: 'bucket', label: 'Building up now', total: 450000 })
  })

  it('finds the bills already folded away, under what they became', () => {
    const l = linkedTransactions(base({
      folds: [{ improvementName: 'House', completedOn: '2026-11-01', transactionIds: ['f1'] }],
      byId: map(row('f1', 450000, '2026-03-01')),
    }))
    expect(l.groups[0].label).toBe('House — folded 2026-11-01')
    expect(l.groups[0].reason).toBe('folded')
  })

  it('finds the sale', () => {
    const l = linkedTransactions(base({
      saleTransactionId: 's1',
      byId: map(row('s1', 3_500_000, '2026-10-10', 'Land sale')),
    }))
    expect(l.groups[0]).toMatchObject({ reason: 'sale', label: 'Sold for', total: 3_500_000 })
  })

  it('tells what went in from what came out', () => {
    const l = linkedTransactions(base({
      purchaseTransactionId: 'p1',
      improvements: [{ name: 'Wall', transaction_ids: ['a'] }],
      saleTransactionId: 's1',
      byId: map(row('p1', 2_000_000, '2019-06-01'), row('a', 90000, '2021-02-02'), row('s1', 3_500_000, '2026-10-10')),
    }))
    expect(l.spent).toBe(2_090_000)
    expect(l.received).toBe(3_500_000)
    expect(l.count).toBe(3)
  })

  it('tells the asset’s story in order: bought, added to, building, folded, sold', () => {
    const l = linkedTransactions(base({
      purchaseTransactionId: 'p1',
      improvements: [{ name: 'Wall', transaction_ids: ['a'] }],
      bucketTxns: [row('x', 1, '2026-03-01')],
      folds: [{ improvementName: 'House', completedOn: '2026-11-01', transactionIds: ['f1'] }],
      saleTransactionId: 's1',
      byId: map(row('p1', 1, '2019-06-01'), row('a', 1, '2021-01-01'), row('x', 1, '2026-03-01'),
        row('f1', 1, '2026-02-01'), row('s1', 1, '2026-10-10')),
    }))
    expect(l.groups.map(g => g.reason)).toEqual(['purchase', 'improvement', 'bucket', 'folded', 'sale'])
  })

  it('puts the newest first inside a group', () => {
    const l = linkedTransactions(base({
      bucketTxns: [row('old', 1, '2026-01-01'), row('new', 1, '2026-09-09')],
      byId: map(row('old', 1, '2026-01-01'), row('new', 1, '2026-09-09')),
    }))
    expect(l.groups[0].txns.map(t => t.id)).toEqual(['new', 'old'])
  })

  it('leaves out an improvement with no bills tagged to it', () => {
    const l = linkedTransactions(base({ improvements: [{ name: 'Wall' }, { name: 'Gate', transaction_ids: [] }] }))
    expect(l.groups).toEqual([])
  })

  it('takes a bill at its absolute value, however it was signed', () => {
    const l = linkedTransactions(base({ purchaseTransactionId: 'p1', byId: map(row('p1', -500, '2026-01-01')) }))
    expect(l.groups[0].total).toBe(500)
  })

  it('reads as empty for an asset with nothing attached', () => {
    const l = linkedTransactions(base())
    expect(l).toMatchObject({ groups: [], spent: 0, received: 0, count: 0, missing: 0 })
  })
})

describe('a transaction that has been deleted', () => {
  const deleted = () => linkedTransactions(base({
    improvements: [{ name: 'Wall', transaction_ids: ['gone', 'here'] }],
    byId: map(row('here', 1000, '2026-01-01')),
  }))

  it('is reported rather than quietly dropped', () => {
    // The asset's figures were built on it; silence would make the numbers
    // look sound when they are not.
    const l = deleted()
    expect(l.missing).toBe(1)
    expect(l.groups[0].txns.some(t => !t.found)).toBe(true)
    expect(l.groups[0].missing).toBe(1)
  })

  it('counts as nothing towards the total, rather than guessing', () => {
    expect(deleted().groups[0].total).toBe(1000)
  })

  it('is said in words, singular and plural', () => {
    expect(missingWords(deleted())).toBe('One transaction behind these figures has since been deleted.')
    const two = linkedTransactions(base({
      improvements: [{ name: 'Wall', transaction_ids: ['a', 'b'] }],
      byId: new Map(),
    }))
    expect(missingWords(two)).toContain('2 transactions')
  })

  it('says nothing when they are all there', () => {
    const fine = linkedTransactions(base({ purchaseTransactionId: 'p1', byId: map(row('p1', 1, '2026-01-01')) }))
    expect(missingWords(fine)).toBeNull()
  })
})

describe('the empty state', () => {
  it('promises the next bill will land when a category feeds it', () => {
    expect(nothingLinkedWords(true)).toContain('next bill filed under its category')
  })

  it('says how to attach one otherwise', () => {
    expect(nothingLinkedWords(false)).toContain('point a category at it')
  })
})
