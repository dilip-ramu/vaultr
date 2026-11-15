// Pieces into cartons. The supplier ships against these numbers, so every
// one of them is checked — including the awkward cases: several sets to a
// carton, and a carton that mixes two styles.

import { describe, it, expect } from 'vitest'
import {
  cleanContents, piecesPerSet, piecesPerCarton, packPieces, totalCartons, totalPieces,
  packByKey, packedByKey, packProblem, reconcilePacking, remainingByKey,
  suggestCartons, maxCartons, describePack, describePacking, packingRows, packKey,
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
  it('lays a solid pack out as box, count, sizes', () => {
    expect(packingRows([solid(POLO, 'M', 20, 10)], name)[0]).toEqual({
      label: 'Box 1', boxes: '10 boxes', lines: [{ contents: 'M-20', style: '' }],
      note: '20 pcs/box · 200 pcs',
    })
  })

  it('writes an assortment the way it is spoken', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
      { lineId: POLO, size: 'L', qty: 2 }, { lineId: POLO, size: 'XL', qty: 1 },
    ], cartons: 20 })
    expect(packingRows([p], name)[0].lines).toEqual([{ contents: 'S-1, M-2, L-2, XL-1', style: '' }])
  })

  it('numbers the boxes in order', () => {
    const rows = packingRows([solid(POLO, 'M', 20, 1), solid(POLO, 'L', 20, 1)], name)
    expect(rows.map(r => r.label)).toEqual(['Box 1', 'Box 2'])
  })

  it('says "1 box" rather than "1 boxes"', () => {
    expect(packingRows([solid(POLO, 'M', 20, 1)], name)[0].boxes).toBe('1 box')
  })

  it('gives a mixed carton one line PER STYLE, each named', () => {
    // The packer fills the box style by style. One long run of sizes with
    // the styles buried in it is how the wrong garment goes in.
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: POLO, size: 'M', qty: 2 },
      { lineId: TEE, size: 'S', qty: 1 }, { lineId: TEE, size: 'M', qty: 2 },
    ], cartons: 20 })
    expect(packingRows([p], name)[0].lines).toEqual([
      { contents: 'S-1, M-2', style: '(Polo navy)' },
      { contents: 'S-1, M-2', style: '(Crew tee)' },
    ])
  })

  it('does not name the style when the whole order is one style', () => {
    const rows = packingRows([solid(POLO, 'M', 20, 2), solid(POLO, 'L', 20, 2)], name)
    expect(rows.every(r => r.lines.every(l => l.style === ''))).toBe(true)
  })

  it('names the style on every row once any carton mixes them', () => {
    const rows = packingRows([
      solid(POLO, 'M', 20, 2),
      pack({ contents: [{ lineId: POLO, size: 'L', qty: 1 }, { lineId: TEE, size: 'L', qty: 1 }], cartons: 5 }),
    ], name)
    expect(rows[0].lines[0].style).toBe('(Polo navy)')
  })

  it('says when a box takes more than one set', () => {
    const p = pack({ contents: ['S', 'M'].map(size => ({ lineId: POLO, size, qty: 1 })), setsPerCarton: 2, cartons: 10 })
    expect(packingRows([p], name)[0].lines[0].contents).toBe('2 sets of S-1, M-1')
    expect(packingRows([p], name)[0].note).toBe('4 pcs/box · 40 pcs')
  })

  it('writes a style with no size breakdown as a piece count', () => {
    const p = pack({ contents: [{ lineId: POLO, size: '', qty: 12 }], cartons: 5 })
    expect(packingRows([p], name)[0].lines[0].contents).toBe('12 pcs')
  })

  it('leaves out a pack with nothing in it', () => {
    expect(packingRows([pack({ cartons: 5 })], name)).toEqual([])
  })

  it('lines the continuation up under the first line in plain text', () => {
    const p = pack({ contents: [
      { lineId: POLO, size: 'S', qty: 1 }, { lineId: TEE, size: 'S', qty: 1 },
    ], cartons: 20 })
    const [first, second] = describePacking([p], name).split('\n')
    expect(first).toBe('Box 1 - 20 boxes, S-1 (Polo navy)')
    expect(second.indexOf('S-1')).toBe(first.indexOf('S-1'))
  })

  it('fits one pack on one line for a screen', () => {
    expect(describePack(solid(POLO, 'M', 20, 10), name)).toBe('10 boxes, M-20 · 20 pcs/box · 200 pcs')
  })

  it('says nothing for an empty pack', () => {
    expect(describePack(pack(), name)).toBe('')
    expect(describePacking([], name)).toBe('')
  })
})

describe('packing more than was ordered', () => {
  const ordered180: OrderedPiece[] = [{ lineId: POLO, size: 'S', qty: 180 }]

  it('suggests what fits, but does not stop you going past it', () => {
    // A supplier may ship a few per cent over when it has been agreed, so
    // the carton box is a suggestion and not a cap.
    expect(maxCartons(solid(POLO, 'S', 20, 0), ordered180, [])).toBe(9)
  })

  it('measures against what the OTHER packs have already claimed', () => {
    const taken = solid(POLO, 'S', 20, 5)          // 100 of the 180 gone
    expect(maxCartons(solid(POLO, 'S', 20, 0), ordered180, [taken])).toBe(4)
  })

  it('does not count a pack against itself while it is being edited', () => {
    expect(maxCartons(solid(POLO, 'S', 20, 9), ordered180, [])).toBe(9)
  })

  it('treats over as within tolerance when the order agreed one', () => {
    // 185 against 180, on an order where 5% was negotiated.
    const r = reconcilePacking(ordered180, [pack({ contents: [{ lineId: POLO, size: 'S', qty: 185 }], cartons: 1 })], 5)
    expect(r.overWithinTolerance.map(d => d.size)).toEqual(['S'])
    expect(r.overBeyondTolerance).toEqual([])
  })

  it('counts the last piece of the tolerance as still inside it', () => {
    // 5% of 180 is 189.
    const at = reconcilePacking(ordered180, [pack({ contents: [{ lineId: POLO, size: 'S', qty: 189 }], cartons: 1 })], 5)
    const past = reconcilePacking(ordered180, [pack({ contents: [{ lineId: POLO, size: 'S', qty: 190 }], cartons: 1 })], 5)
    expect(at.overWithinTolerance).toHaveLength(1)
    expect(past.overBeyondTolerance).toHaveLength(1)
  })

  it('calls a serious overpack what it is', () => {
    const r = reconcilePacking(ordered180, [solid(POLO, 'S', 20, 10)], 5)   // 200
    expect(r.overBeyondTolerance.map(d => [d.size, d.difference])).toEqual([['S', -20]])
  })

  it('allows no tolerance on a size that was never ordered', () => {
    const r = reconcilePacking(ordered180, [solid(POLO, 'XXL', 5, 1)], 5)
    expect(r.overBeyondTolerance.map(d => d.size)).toEqual(['XXL'])
  })

  it('can be given a different tolerance', () => {
    const r = reconcilePacking(ordered180, [solid(POLO, 'S', 20, 10)], 15)   // 200 vs 207
    expect(r.overWithinTolerance).toHaveLength(1)
    expect(r.tolerancePct).toBe(15)
  })

  it('allows nothing when the order negotiated no tolerance', () => {
    // An allowance nobody agreed is an allowance that does not exist.
    const r = reconcilePacking(ordered180, [pack({ contents: [{ lineId: POLO, size: 'S', qty: 181 }], cartons: 1 })])
    expect(r.tolerancePct).toBe(0)
    expect(r.overBeyondTolerance).toHaveLength(1)
    expect(r.overWithinTolerance).toEqual([])
  })

  it('ignores a nonsense tolerance rather than allowing anything', () => {
    expect(reconcilePacking(ordered180, [], -20).tolerancePct).toBe(0)
  })
})
