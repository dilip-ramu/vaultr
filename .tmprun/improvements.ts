import { describe, it, expect } from './shim'
import {
  improvementValue, improvementsCost, improvementsValue, improvementsGain,
  validateImprovement, costReconciliation, yearsSince,
  type Improvement,
} from '../lib/assets/improvements'

// Fix "now" so the maths is checkable rather than drifting with the calendar.
const NOW = new Date('2026-07-13T00:00:00Z')

const imp = (o: Partial<Improvement>): Improvement => ({
  id: 'i1', name: 'Building', date: '2026-01-13', cost: 4000000, kind: 'depreciate', rate_pct: 2, ...o,
})

describe('each improvement runs on its OWN clock', () => {
  // THE bug this module exists to prevent. The land was bought in 2019; the house
  // was finished six months ago. Depreciating the house from the land's purchase
  // date would age it seven years and show a loss that never happened.
  it('a house finished six months ago has depreciated six months, not seven years', () => {
    const house = imp({ date: '2026-01-13', cost: 4000000, kind: 'depreciate', rate_pct: 2 })
    const v = improvementValue(house, NOW)

    expect(v).toBeGreaterThan(3960000)   // ~half a year of 2% — a whisker off cost
    expect(v).toBeLessThan(4000000)

    // What the old "convert to Building" path would have done: 7 years of decay.
    const asIfAgedFromLandPurchase = 4000000 * Math.pow(0.98, 7.33)
    expect(asIfAgedFromLandPurchase).toBeLessThan(3470000)   // ~₹5.4L of imaginary loss
    expect(v).toBeGreaterThan(asIfAgedFromLandPurchase)
  })

  it('depreciates a 10-year-old structure by ten years of decay', () => {
    const old = imp({ date: '2016-07-13', cost: 1000000, kind: 'depreciate', rate_pct: 5 })
    // 1,000,000 × 0.95^10 ≈ 598,700 (a "year" here is 365.25 days, so it lands a
    // few rupees either side of the neat figure — assert the decay, not the dust).
    const v = improvementValue(old, NOW)
    expect(v).toBeGreaterThan(598000)
    expect(v).toBeLessThan(599500)
  })

  it('appreciates the ones that appreciate', () => {
    const well = imp({ date: '2021-07-13', cost: 200000, kind: 'appreciate', rate_pct: 6 })
    // 200,000 × 1.06^5 ≈ 267,640
    const v = improvementValue(well, NOW)
    expect(v).toBeGreaterThan(267000)
    expect(v).toBeLessThan(268000)
  })

  it('holds a flat one at exactly what it cost, forever', () => {
    const legal = imp({ date: '2010-01-01', cost: 50000, kind: 'flat' })
    expect(improvementValue(legal, NOW)).toBe(50000)
  })
})

describe('the maths cannot run backwards', () => {
  // A building you haven't finished yet has not started losing value. Letting the
  // clock go negative would make a depreciating asset worth MORE than it cost —
  // which reads as a gain you have not made.
  it('a future date does not make a depreciating thing appreciate', () => {
    const notBuiltYet = imp({ date: '2027-12-01', cost: 4000000, kind: 'depreciate', rate_pct: 2 })
    expect(yearsSince('2027-12-01', NOW)).toBe(0)
    expect(improvementValue(notBuiltYet, NOW)).toBe(4000000)   // exactly cost. Not more.
  })

  it('never lets a depreciating thing go below zero', () => {
    const ancient = imp({ date: '1900-01-01', cost: 100000, kind: 'depreciate', rate_pct: 50 })
    expect(improvementValue(ancient, NOW)).toBeGreaterThanOrEqual(0)
  })

  it('a zero rate just holds it at cost', () => {
    expect(improvementValue(imp({ rate_pct: 0 }), NOW)).toBe(4000000)
  })
})

describe('rolling up onto the asset', () => {
  const land = [
    imp({ id: 'a', name: 'Building', date: '2026-01-13', cost: 4000000, kind: 'depreciate', rate_pct: 2 }),
    imp({ id: 'b', name: 'Compound wall', date: '2026-01-13', cost: 200000, kind: 'depreciate', rate_pct: 3 }),
    imp({ id: 'c', name: 'Survey + legal', date: '2019-03-01', cost: 50000, kind: 'flat' }),
  ]

  it('cost is simply what you spent', () => {
    expect(improvementsCost(land)).toBe(4250000)
  })

  it('value is each one on its own clock, added up', () => {
    const v = improvementsValue(land, NOW)
    expect(v).toBeLessThan(4250000)          // the two structures have aged a little
    expect(v).toBeGreaterThan(4150000)       // …but only a little
  })

  it('gain is value less cost, and it is negative here — as it should be', () => {
    // New construction loses value. Recording it honestly means the asset shows a
    // small paper loss on the structure, offset by the land underneath appreciating.
    expect(improvementsGain(land, NOW)).toBeLessThan(0)
  })

  it('an asset with no improvements is worth nothing extra, not NaN', () => {
    expect(improvementsCost([])).toBe(0)
    expect(improvementsValue([], NOW)).toBe(0)
    expect(improvementsGain([], NOW)).toBe(0)
  })
})

describe('validation', () => {
  it('insists on a date, because that is the whole point', () => {
    const r = validateImprovement({ name: 'Building', cost: 4000000, kind: 'depreciate' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('not from when you bought the asset')
  })

  it('wants a name and a cost', () => {
    expect(validateImprovement({ date: '2026-01-13', cost: 100 }).ok).toBe(false)     // no name
    expect(validateImprovement({ date: '2026-01-13', name: 'x' }).ok).toBe(false)     // no cost
    expect(validateImprovement(imp({})).ok).toBe(true)
  })
})

describe('reconciling against the bills you tagged', () => {
  const txns = { t1: 1500000, t2: 1200000, t3: 800000 }

  it('says nothing when you typed a lump sum and tagged nothing', () => {
    expect(costReconciliation(imp({ transaction_ids: [] }), txns)).toBeNull()
  })

  it('adds up the tagged bills and shows the gap', () => {
    const building = imp({ cost: 4000000, transaction_ids: ['t1', 't2', 't3'] })
    const r = costReconciliation(building, txns)!
    expect(r.tagged).toBe(3500000)
    expect(r.typed).toBe(4000000)
    expect(r.difference).toBe(500000)   // ₹5L paid some other way — worth KNOWING, not an error
  })

  it('shows zero difference when the bills account for all of it', () => {
    const building = imp({ cost: 3500000, transaction_ids: ['t1', 't2', 't3'] })
    expect(costReconciliation(building, txns)!.difference).toBe(0)
  })
})

// ── The end-to-end case: a house built on land you already owned ─────────────
import { valueAsset } from '../lib/assets/valuation'
import type { Asset } from '../lib/assets/types'

describe('a building on land bought years earlier', () => {
  // Land bought 2019 for ₹12L, appreciating 8%/yr. House finished Jan 2026 for
  // ₹40L, depreciating 2%/yr. Two clocks, one asset.
  const land = {
    id: 'l1', user_id: 'u', household_id: null,
    name: 'Goundampalayam Site',
    category: 'real_estate', subcategory: 'land',
    valuation_type: 'rate',
    purchase_date: '2019-03-01',
    manual_value: null,
    // The land's appreciation lives on the asset (or the Rates tab), not in details.
    override_rate_pct: 8,
    quantity_g: null, metal: null, metal_purity: null,
    status: 'held',
    include_in_net_worth: true,
    photo_url: null,
    details: {
      area_cent: 10,
      price_per_cent: 120000,          // ₹12L of land
      improvements: [
        { id: 'b', name: 'House', date: '2026-01-13', cost: 4000000, kind: 'depreciate', rate_pct: 2 },
      ],
    },
  } as unknown as Asset

  const v = valueAsset(land, [], [])

  it('counts the house in what the asset cost you', () => {
    expect(v.cost).toBe(5200000)       // ₹12L land + ₹40L house
  })

  it('the land has appreciated seven years; the house has aged six months', () => {
    // Land: 12L × 1.08^7.4 ≈ 21.3L.  House: ~40L, barely touched.
    // The house has NOT been aged from 2019 — which is the entire point.
    expect(v.current).toBeGreaterThan(6000000)   // well above the ₹52L it cost
    expect(v.current).toBeLessThan(6300000)
  })

  it('so the asset is up overall, even though the house itself is down', () => {
    expect(v.gain).toBeGreaterThan(0)
  })

  it('lists the house as its own cost line, dated', () => {
    expect(v.costLines.some(l => l.label.includes('House') && l.label.includes('2026-01-13'))).toBe(true)
  })

  it('a manual value still wins — it does not get a building added on top of it', () => {
    const priced = { ...land, manual_value: 7000000 } as Asset
    expect(valueAsset(priced, [], []).current).toBe(7000000)   // not 7000000 + the house
  })
})
