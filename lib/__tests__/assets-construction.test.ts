import { describe, it, expect } from 'vitest'
import {
  bucket, bucketWords, foldProblem, foldBucket, foldDrift, applyBucket,
  type SpendTxn, type Fold, type FoldRequest,
} from '@/lib/assets/construction'

const t = (id: string, amount: number, date: string): SpendTxn => ({ id, amount, date })

const req = (o: Partial<FoldRequest> = {}): FoldRequest => ({
  sourceAssetId: 'bucket', targetAssetId: 'land', improvementName: 'House',
  completedOn: '2026-11-01', kind: 'flat', ...o,
})

describe('what is in the bucket', () => {
  it('adds up every bill in the category', () => {
    const b = bucket([t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-02')])
    expect(b.amount).toBe(450000)
    expect(b.count).toBe(2)
  })

  it('takes a bill at its absolute value, however it was signed', () => {
    // An expense is stored negative in some places and positive in others; a
    // bill is a bill either way.
    expect(bucket([t('a', -300000, '2026-03-01')]).amount).toBe(300000)
  })

  it('reads zero before anything is spent', () => {
    const b = bucket([])
    expect(b).toMatchObject({ amount: 0, count: 0, firstDate: null, lastDate: null })
  })

  it('leaves out the bills already folded, so the bucket starts again at zero', () => {
    const spend = [t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-02')]
    const folds: Fold[] = [{
      id: 'f1', targetAssetId: 'land', improvementName: 'House',
      completedOn: '2026-05-01', amount: 450000, transactionIds: ['a', 'b'],
    }]
    expect(bucket(spend, folds).amount).toBe(0)
  })

  it('counts only the new project once the last one is folded', () => {
    const spend = [t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-02'), t('c', 90000, '2026-09-09')]
    const folds: Fold[] = [{
      id: 'f1', targetAssetId: 'land', improvementName: 'House',
      completedOn: '2026-05-01', amount: 450000, transactionIds: ['a', 'b'],
    }]
    const b = bucket(spend, folds)
    expect(b.amount).toBe(90000)
    expect(b.count).toBe(1)
  })

  it('keeps a back-dated bill in the NEW bucket rather than swallowing it', () => {
    // Excluding by date would hide a bill entered late but dated before the
    // fold. Excluding by id leaves it where it belongs, in plain sight.
    const spend = [t('a', 300000, '2026-03-01'), t('late', 25000, '2026-04-15')]
    const folds: Fold[] = [{
      id: 'f1', targetAssetId: 'land', improvementName: 'House',
      completedOn: '2026-05-01', amount: 300000, transactionIds: ['a'],
    }]
    const b = bucket(spend, folds)
    expect(b.amount).toBe(25000)
    expect(b.transactions.map(x => x.id)).toEqual(['late'])
  })

  it('orders the bills oldest first and reports the span', () => {
    const b = bucket([t('b', 1, '2026-04-02'), t('a', 1, '2026-03-01')])
    expect(b.transactions.map(x => x.id)).toEqual(['a', 'b'])
    expect(b.firstDate).toBe('2026-03-01')
    expect(b.lastDate).toBe('2026-04-02')
  })

  it('survives a rubbish amount without producing NaN', () => {
    expect(bucket([t('a', NaN, '2026-03-01')]).amount).toBe(0)
  })
})

describe('the bucket in words', () => {
  it('says how many bills and over what span', () => {
    expect(bucketWords(bucket([t('a', 1, '2026-03-01'), t('b', 1, '2026-04-02')])))
      .toBe('2 bills, 2026-03-01 to 2026-04-02')
  })

  it('says it plainly for one day', () => {
    expect(bucketWords(bucket([t('a', 1, '2026-03-01')]))).toBe('1 bill, all on 2026-03-01')
  })

  it('says nothing has been spent', () => {
    expect(bucketWords(bucket([]))).toBe('Nothing spent yet on this one.')
  })
})

describe('whether a fold can go ahead', () => {
  const b = bucket([t('a', 300000, '2026-03-01')])

  it('allows a complete one', () => {
    expect(foldProblem(b, req())).toBeNull()
  })

  it('refuses an empty bucket', () => {
    expect(foldProblem(bucket([]), req())).toContain('nothing in this bucket')
  })

  it('refuses folding a bucket into itself', () => {
    // It would empty the bucket and add the same money straight back — a
    // no-op dressed up as a reset.
    expect(foldProblem(b, req({ targetAssetId: 'bucket' }))).toContain('cannot be folded into itself')
  })

  it('asks for a target, a name and a completion date', () => {
    expect(foldProblem(b, req({ targetAssetId: '' }))).toContain('Pick the asset')
    expect(foldProblem(b, req({ improvementName: '  ' }))).toContain('Give it a name')
    expect(foldProblem(b, req({ completedOn: 'soon' }))).toContain('when the work was finished')
  })

  it('asks for a rate only when it is not flat', () => {
    expect(foldProblem(b, req({ kind: 'flat', ratePct: null }))).toBeNull()
    expect(foldProblem(b, req({ kind: 'depreciate', ratePct: 0 }))).toContain('yearly rate')
    expect(foldProblem(b, req({ kind: 'depreciate', ratePct: 5 }))).toBeNull()
  })
})

describe('folding', () => {
  const b = bucket([t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-02')])

  it('makes one improvement for the whole bucket, dated when the work finished', () => {
    const { improvement } = foldBucket(b, req({ improvementName: 'House', completedOn: '2026-11-01' }))
    expect(improvement).toMatchObject({ name: 'House', date: '2026-11-01', cost: 450000, kind: 'flat' })
  })

  it('remembers exactly which bills went in', () => {
    const { improvement, fold } = foldBucket(b, req())
    expect(improvement.transaction_ids).toEqual(['a', 'b'])
    expect(fold.transactionIds).toEqual(['a', 'b'])
    expect(fold.amount).toBe(450000)
  })

  it('writes a note saying what it was made of', () => {
    expect(foldBucket(b, req()).improvement.note).toBe('2 bills from 2026-03-01 to 2026-04-02.')
  })

  it('carries the rate only when it depreciates or appreciates', () => {
    expect(foldBucket(b, req({ kind: 'flat' })).improvement.rate_pct).toBeUndefined()
    expect(foldBucket(b, req({ kind: 'depreciate', ratePct: 5 })).improvement.rate_pct).toBe(5)
  })

  it('trims the name, so the asset does not carry stray spaces', () => {
    expect(foldBucket(b, req({ improvementName: '  Second floor  ' })).improvement.name).toBe('Second floor')
  })
})

describe('a fold whose bills changed afterwards', () => {
  const fold: Fold = {
    id: 'f1', targetAssetId: 'land', improvementName: 'House',
    completedOn: '2026-05-01', amount: 450000, transactionIds: ['a', 'b'],
  }

  it('says nothing while they still agree', () => {
    expect(foldDrift(fold, [t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-02')])).toBeNull()
  })

  it('reports a corrected bill rather than quietly moving the asset', () => {
    const drift = foldDrift(fold, [t('a', 320000, '2026-03-01'), t('b', 150000, '2026-04-02')])
    expect(drift?.difference).toBe(20000)
    expect(drift?.words).toContain('more than the')
  })

  it('reports a bill that was deleted', () => {
    const drift = foldDrift(fold, [t('a', 300000, '2026-03-01')])
    expect(drift?.words).toContain('has since been deleted')
  })

  it('reports both at once', () => {
    const drift = foldDrift(fold, [t('a', 290000, '2026-03-01')])
    expect(drift?.words).toContain('less than the')
    expect(drift?.words).toContain('deleted')
  })
})

describe('the bucket in what the asset is worth', () => {
  const base = {
    cost: 2_000_000, costLines: [{ label: 'Purchase price', amount: 2_000_000 }],
    current: 2_600_000, gain: 600_000, returnPct: 30,
  }

  it('adds the spend to both the cost and the value', () => {
    // Money spent on the thing is part of what the thing is worth, today, on
    // the list — not a note to open the asset and read.
    const v = applyBucket(base, bucket([t('a', 450000, '2026-03-01')]))
    expect(v.cost).toBe(2_450_000)
    expect(v.current).toBe(3_050_000)
  })

  it('claims no gain on money just spent', () => {
    const v = applyBucket(base, bucket([t('a', 450000, '2026-03-01')]))
    expect(v.gain).toBe(600_000)
  })

  it('recomputes the return against the bigger cost', () => {
    const v = applyBucket(base, bucket([t('a', 450000, '2026-03-01')]))
    expect(v.returnPct).toBeCloseTo(24.49, 1)
  })

  it('says how much is building work, and over how many bills', () => {
    const v = applyBucket(base, bucket([t('a', 300000, '2026-03-01'), t('b', 150000, '2026-04-01')]))
    expect(v.costLines.at(-1)).toEqual({ label: 'Spent so far (2 bills)', amount: 450000 })
  })

  it('gets the singular right', () => {
    const v = applyBucket(base, bucket([t('a', 300000, '2026-03-01')]))
    expect(v.costLines.at(-1)?.label).toBe('Spent so far (1 bill)')
  })

  it('leaves an asset with no bucket exactly as it was', () => {
    expect(applyBucket(base, undefined)).toBe(base)
    expect(applyBucket(base, bucket([]))).toBe(base)
  })

  it('values a bucket-only asset at what has been spent', () => {
    // A Construction asset has no purchase price of its own: it is worth the
    // bills and nothing else.
    const empty = { cost: 0, costLines: [], current: 0, gain: 0, returnPct: 0 }
    const v = applyBucket(empty, bucket([t('a', 450000, '2026-03-01')]))
    expect(v).toMatchObject({ cost: 450000, current: 450000, gain: 0, returnPct: 0 })
  })
})
