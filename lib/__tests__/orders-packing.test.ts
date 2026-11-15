// Pieces into cartons. The supplier ships against these numbers, so every
// one of them is checked — including the awkward cases: several sets to a
// carton, and a carton that mixes two styles.

import { describe, it, expect } from 'vitest'
import {
  cleanContents, piecesPerSet, piecesPerCarton, packPieces, totalCartons, totalPieces,
  packByKey, packedByKey, packProblem, reconcilePacking, remainingByKey,
  suggestCartons, describePack, describePacking, packingTable, packKey,
  type Pack, type OrderedPiece,
} from '@/lib/orders/packing'

const POLO = 'line-polo'
const TEE = 'line-tee'
const name = (id: string) => (id === POLO ? 'Polo navy' : id === TEE ? 'Crew tee' : id)

const pack = (over: Partial<Pack> = {}): Pack =>
  ({ kind: 'assort', contents: [], setsPerCarton: 1, cartons: 0, ...over })

const solid = (lineId: string, size: string, qty: number, cartons: number): Pack =>
  pack({ kind: 'solid', contents: [{ lineId, size, qty }], cartons })

/** 100 each of four sizes of the polo. */
const ORDERED: OrderedPiece[] = ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 100 }))

describe('one carton', () => {
  it('a solid carton holds one style and one size', () => {
    expect(piecesPerCarton(solid(POLO, 'M', 20, 5))).toBe(20)
  })

  it('an assorted carton holds the whole set', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
      { lineId: POLO, size: 'L', qty: 2 }, { lineId: POLO, size: 'XL', qty: 1 },
    ], cartons: 50 })
    expect(piecesPerSet(p)).toBe(6)
    expect(piecesPerCarton(p)).toBe(6)
    expect(packPieces(p)).toBe(300)
  })

  it('holds several sets when a carton takes more than one', () => {
    // Two assortments of four pieces in one box is eight pieces a box.
    const p = pack({
      contents: ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 1 })),
      setsPerCarton: 2, cartons: 50,
    })
    expect(piecesPerSet(p)).toBe(4)
    expect(piecesPerCarton(p)).toBe(8)
    expect(packPieces(p)).toBe(400)
  })

  it('can mix two styles in one carton', () => {
    // One medium of each of two styles, together in a box.
    const p = pack({ contents: [
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: TEE, size: 'M', qty: 1 },
    ], cartons: 100 })
    expect(piecesPerCarton(p)).toBe(2)
    expect(packByKey(p)).toEqual({ [packKey(POLO, 'M')]: 100, [packKey(TEE, 'M')]: 100 })
  })

  it('treats a missing or silly set count as one', () => {
    expect(piecesPerCarton(pack({ contents: [{ lineId: POLO, size: 'M', qty: 5 }], setsPerCarton: 0, cartons: 1 }))).toBe(5)
    expect(piecesPerCarton(pack({ contents: [{ lineId: POLO, size: 'M', qty: 5 }], setsPerCarton: -3, cartons: 1 }))).toBe(5)
  })
})

describe('tidying what was entered', () => {
  it('drops entries with no style or no pieces', () => {
    expect(cleanContents([
      { lineId: POLO, size: 'S', qty: 1 },
      { lineId: '', size: 'M', qty: 2 },
      { lineId: POLO, size: 'L', qty: 0 },
    ])).toEqual([{ lineId: POLO, size: 'S', qty: 1 }])
  })

  it('merges the same style and size entered twice', () => {
    expect(cleanContents([
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
    ])).toEqual([{ lineId: POLO, size: 'M', qty: 3 }])
  })

  it('keeps the same size of two different styles apart', () => {
    expect(cleanContents([
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: TEE, size: 'M', qty: 1 },
    ])).toHaveLength(2)
  })

  it('refuses a fraction of a piece — half a shirt does not go in a box', () => {
    expect(cleanContents([{ lineId: POLO, size: 'M', qty: 1.7 }])).toEqual([{ lineId: POLO, size: 'M', qty: 1 }])
  })

  it('allows a style with no size breakdown', () => {
    expect(cleanContents([{ lineId: POLO, size: '', qty: 12 }])).toEqual([{ lineId: POLO, size: '', qty: 12 }])
  })
})

describe('a pack that cannot be packed', () => {
  it('objects to a solid carton holding two things', () => {
    expect(packProblem(pack({ kind: 'solid', cartons: 5, contents: [
      { lineId: POLO, size: 'S', qty: 10 }, { lineId: POLO, size: 'M', qty: 10 },
    ] }))).toBe('A solid carton holds one style and one size')
  })

  it('is happy with an assorted carton holding several', () => {
    expect(packProblem(pack({ cartons: 5, contents: [
      { lineId: POLO, size: 'S', qty: 10 }, { lineId: TEE, size: 'M', qty: 10 },
    ] }))).toBe(null)
  })

  it('objects to an empty carton and to no carton count', () => {
    expect(packProblem(pack({ cartons: 5 }))).toBe('Nothing in this carton yet')
    expect(packProblem(solid(POLO, 'M', 20, 0))).toBe('No carton count')
  })

  it('objects when a style has been removed from the order', () => {
    expect(packProblem(solid('gone', 'M', 10, 2), new Set([POLO])))
      .toBe('Refers to a style that is no longer on this order')
  })
})

describe('adding the packing up against the order', () => {
  it('is balanced when every size is accounted for', () => {
    const p = pack({ contents: ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 1 })), cartons: 100 })
    const r = reconcilePacking(ORDERED, [p])
    expect(r).toMatchObject({ balanced: true, packedTotal: 400, orderedTotal: 400, cartons: 100 })
  })

  it('handles an order split between solid and assorted', () => {
    const packs = [
      solid(POLO, 'S', 20, 2), solid(POLO, 'M', 20, 2), solid(POLO, 'L', 20, 2), solid(POLO, 'XL', 20, 2),
      pack({ contents: ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 1 })), cartons: 60 }),
    ]
    const r = reconcilePacking(ORDERED, packs)
    expect(r.balanced).toBe(true)
    expect(r.cartons).toBe(68)
    expect(totalPieces(packs)).toBe(400)
  })

  it('counts a mixed-style carton against both styles', () => {
    const ordered: OrderedPiece[] = [
      { lineId: POLO, size: 'M', qty: 100 }, { lineId: TEE, size: 'M', qty: 100 },
    ]
    const r = reconcilePacking(ordered, [pack({ contents: [
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: TEE, size: 'M', qty: 1 },
    ], cartons: 100 })])
    expect(r.balanced).toBe(true)
    expect(r.packedTotal).toBe(200)
  })

  it('says what is still to pack', () => {
    const r = reconcilePacking(ORDERED, [solid(POLO, 'M', 20, 5)])
    expect(r.short.map(d => [d.size, d.difference])).toEqual([['S', 100], ['L', 100], ['XL', 100]])
  })

  it('catches packing more than was ordered', () => {
    const r = reconcilePacking([{ lineId: POLO, size: 'M', qty: 100 }], [solid(POLO, 'M', 20, 6)])
    expect(r.over.map(d => d.difference)).toEqual([-20])
  })

  it('reports per size, because totals hide the mistake that happens', () => {
    const ordered: OrderedPiece[] = [
      { lineId: POLO, size: 'S', qty: 100 }, { lineId: POLO, size: 'L', qty: 100 },
    ]
    const r = reconcilePacking(ordered, [solid(POLO, 'S', 20, 6), solid(POLO, 'L', 20, 4)])
    expect(r.orderedTotal).toBe(200)
    expect(r.packedTotal).toBe(200)
    expect(r.balanced).toBe(false)
    expect(r.over.map(d => d.size)).toEqual(['S'])
    expect(r.short.map(d => d.size)).toEqual(['L'])
  })

  it('is not balanced when there is no packing at all', () => {
    expect(reconcilePacking([], []).balanced).toBe(false)
  })
})

describe('what is left, and how many cartons fit', () => {
  it('works out the remainder', () => {
    const left = remainingByKey(ORDERED, [solid(POLO, 'M', 20, 3)])
    expect(left[packKey(POLO, 'M')]).toBe(40)
    expect(left[packKey(POLO, 'S')]).toBe(100)
  })

  it('is limited by the tightest line in the set', () => {
    // S1 M2 L2 XL1 against 100 of each makes fifty cartons, not a hundred.
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
      { lineId: POLO, size: 'L', qty: 2 }, { lineId: POLO, size: 'XL', qty: 1 },
    ] })
    expect(suggestCartons(p, remainingByKey(ORDERED, []))).toBe(50)
  })

  it('counts the sets per carton when suggesting', () => {
    // Two sets of one-each per carton: 100 of each makes fifty cartons.
    const p = pack({ contents: ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 1 })), setsPerCarton: 2 })
    expect(suggestCartons(p, remainingByKey(ORDERED, []))).toBe(50)
  })

  it('rounds down rather than suggesting a part carton', () => {
    expect(suggestCartons(solid(POLO, 'M', 20, 0), { [packKey(POLO, 'M')]: 90 })).toBe(4)
  })

  it('suggests nothing when one of the sizes has run out', () => {
    const p = pack({ contents: [{ lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 1 }] })
    expect(suggestCartons(p, { [packKey(POLO, 'S')]: 50, [packKey(POLO, 'M')]: 0 })).toBe(0)
  })
})

describe('what the supplier reads', () => {
  it('writes a solid pack plainly', () => {
    expect(describePack(solid(POLO, 'M', 20, 5), name))
      .toBe('5 ctn × 20 × M — Polo navy · 20 pcs/ctn · 100 pcs')
  })

  it('writes an assortment as the set it is', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
      { lineId: POLO, size: 'L', qty: 2 }, { lineId: POLO, size: 'XL', qty: 1 },
    ], cartons: 50 })
    expect(describePack(p, name))
      .toBe('50 ctn × (S + 2 × M + 2 × L + XL) — Polo navy · 6 pcs/ctn · 300 pcs')
  })

  it('says so when a carton holds more than one set', () => {
    const p = pack({ contents: ['S', 'M', 'L', 'XL'].map(size => ({ lineId: POLO, size, qty: 1 })), setsPerCarton: 2, cartons: 50 })
    expect(describePack(p, name)).toContain('2 sets of (S + M + L + XL)')
    expect(describePack(p, name)).toContain('8 pcs/ctn')
  })

  it('names both styles when the carton mixes them', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: TEE, size: 'M', qty: 1 },
    ], cartons: 100 })
    expect(describePack(p, name))
      .toBe('100 ctn × (Polo navy / M + Crew tee / M) · 2 pcs/ctn · 200 pcs')
  })

  it('does not repeat the style on every line of a single-style carton', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 1 },
    ], cartons: 10 })
    expect(describePack(p, name).match(/Polo navy/g)).toHaveLength(1)
  })

  it('says nothing for an empty pack', () => {
    expect(describePack(pack(), name)).toBe('')
    expect(describePacking([], name)).toBe('')
  })

  it('puts each pack on its own line', () => {
    const out = describePacking([solid(POLO, 'M', 20, 5), solid(TEE, 'L', 10, 2)], name)
    expect(out.split('\n')).toHaveLength(2)
  })
})

describe('the packing table on the summary sheet', () => {
  it('gives a row per pack with the numbers a packer needs', () => {
    const rows = packingTable([solid(POLO, 'M', 20, 5)], name)
    expect(rows[0]).toEqual({
      cartons: '5', contents: '20 × Polo navy / M', perCarton: '20', pieces: '100', kind: 'Solid',
    })
  })

  it('marks a mixed-style carton as such', () => {
    const rows = packingTable([pack({ contents: [
      { lineId: POLO, size: 'M', qty: 1 }, { lineId: TEE, size: 'M', qty: 1 },
    ], cartons: 100 })], name)
    expect(rows[0].kind).toBe('Assort (mixed styles)')
    expect(rows[0].contents).toBe('Polo navy / M\nCrew tee / M')
  })

  it('spells out several sets to a carton', () => {
    const rows = packingTable([pack({
      contents: ['S', 'M'].map(size => ({ lineId: POLO, size, qty: 1 })), setsPerCarton: 2, cartons: 10,
    })], name)
    expect(rows[0].contents.startsWith('2 sets of:')).toBe(true)
    expect(rows[0].perCarton).toBe('4')
  })

  it('leaves out a pack with nothing in it', () => {
    expect(packingTable([pack({ cartons: 5 })], name)).toEqual([])
  })
})
