import { describe, it, expect } from 'vitest'
import {
  calcPerPieceCost,
  calcBaseCost,
  applyMarkup,
  distributeRoundingDiff,
  processShipment,
} from '../allocation'

describe('calcPerPieceCost', () => {
  it('returns totalCost / totalPieces rounded to 4dp', () => {
    expect(calcPerPieceCost(3698.25, 11)).toBe(336.2045)
  })

  it('throws when totalPieces is zero', () => {
    expect(() => calcPerPieceCost(1000, 0)).toThrow('totalPieces cannot be zero')
  })
})

describe('calcBaseCost', () => {
  it('returns pieces × perPieceCost rounded to 4dp', () => {
    expect(calcBaseCost(3, 336.2045)).toBe(1008.6135)
    expect(calcBaseCost(7, 336.2045)).toBe(2353.4315)
  })
})

describe('applyMarkup', () => {
  it('percentage markup: 10% on ₹336.20 = ₹33.62 markup, total ₹369.82', () => {
    const { markupAmount, total } = applyMarkup(336.20, 'percentage', 10)
    expect(markupAmount).toBe(33.62)
    expect(total).toBe(369.82)
  })

  it('flat markup: ₹50 flat → markupAmount = 50 regardless of base', () => {
    const { markupAmount, total } = applyMarkup(500, 'flat', 50)
    expect(markupAmount).toBe(50)
    expect(total).toBe(550)
  })

  it('none markup: markupAmount = 0, total = baseCost rounded to 2dp', () => {
    const { markupAmount, total } = applyMarkup(336.2045, 'none', 0)
    expect(markupAmount).toBe(0)
    expect(total).toBe(336.20)
  })
})

describe('distributeRoundingDiff', () => {
  it('adds rounding diff to the allocation with most pieces', () => {
    // Supplier A: 1 PCS × 336.2045 = 336.20
    // Supplier B: 3 PCS × 336.2045 = 1008.61
    // Supplier C: 7 PCS × 336.2045 = 2353.43
    // Sum = 3698.24, diff = 0.01 → add to Supplier C (7 PCS)
    const input = [
      { pieces: 1, baseCost: 336.20 },
      { pieces: 3, baseCost: 1008.61 },
      { pieces: 7, baseCost: 2353.43 },
    ]
    const result = distributeRoundingDiff(input, 3698.25)
    const sum = Math.round(result.reduce((s, a) => s + a.baseCost, 0) * 100) / 100
    expect(sum).toBe(3698.25)
    // Supplier C should receive the correction
    expect(result[2].baseCost).toBe(2353.44)
  })

  it('leaves allocations unchanged when sum already equals totalCost', () => {
    const input = [{ pieces: 2, baseCost: 500 }, { pieces: 2, baseCost: 500 }]
    const result = distributeRoundingDiff(input, 1000)
    expect(result[0].baseCost).toBe(500)
    expect(result[1].baseCost).toBe(500)
  })
})

describe('processShipment', () => {
  const suppliers = { 'Supplier A': 1, 'Supplier B': 3, 'Supplier C': 7, 'Supplier D': 0 }

  it('computes per-piece cost: ₹3698.25 / 11 = ₹336.2045', () => {
    const s = processShipment('AWB001', 3698.25, suppliers)
    expect(s.perPieceCost).toBe(336.2045)
  })

  it('allocates correctly: A=₹336.20, B=₹1008.61, C=₹2353.44 (post-rounding)', () => {
    const s = processShipment('AWB001', 3698.25, suppliers)
    const a = s.allocations.find(x => x.supplierName === 'Supplier A')!
    const b = s.allocations.find(x => x.supplierName === 'Supplier B')!
    const c = s.allocations.find(x => x.supplierName === 'Supplier C')!
    expect(a.recoverableAmount).toBe(336.20)
    expect(b.recoverableAmount).toBe(1008.61)
    expect(c.recoverableAmount).toBe(2353.44)
  })

  it('rounding: sum of allocations equals totalCost exactly', () => {
    const s = processShipment('AWB001', 3698.25, suppliers)
    const sum = Math.round(s.allocations.reduce((t, a) => t + a.recoverableAmount, 0) * 100) / 100
    expect(sum).toBe(3698.25)
  })

  it('excludes zero-piece suppliers from allocations', () => {
    const s = processShipment('AWB001', 3698.25, suppliers)
    expect(s.allocations.find(a => a.supplierName === 'Supplier D')).toBeUndefined()
    expect(s.allocations).toHaveLength(3)
  })

  it('applies markup rules per supplier', () => {
    const s = processShipment('AWB001', 3698.25, suppliers, {
      'Supplier A': { markupType: 'percentage', markupValue: 10 },
      'Supplier B': { markupType: 'flat', markupValue: 50 },
    })
    const a = s.allocations.find(x => x.supplierName === 'Supplier A')!
    const b = s.allocations.find(x => x.supplierName === 'Supplier B')!
    expect(a.markupAmount).toBeGreaterThan(0)
    expect(b.markupAmount).toBe(50)
  })

  it('throws when all suppliers have zero pieces', () => {
    expect(() => processShipment('AWB001', 100, { 'X': 0, 'Y': 0 }))
      .toThrow('totalPieces cannot be zero')
  })
})
