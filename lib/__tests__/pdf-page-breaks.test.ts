// Where a long document gets cut into pages.
//
// The bug this replaces: the statement was one tall image sliced every 297mm,
// so pages ended mid-row with a balance figure sheared in half. A reader cannot
// tell a rendering fault from a wrong number, which defeats the point of
// sending the thing.

import { describe, it, expect } from 'vitest'
import { chooseBreaks, pageSlices } from '@/lib/pdf/pageBreaks'

describe('choosing where to cut', () => {
  it('does not cut at all when everything fits on one page', () => {
    expect(chooseBreaks([100, 200], 500, 1000)).toEqual([500])
  })

  it('cuts at the last safe offset that fits, not at the page edge', () => {
    // Rows every 100 up to 1500, page holds 1000. The naive slicer cuts at
    // exactly 1000; the right answer is 1000 only because a row starts there.
    const rows = [200, 400, 600, 800, 950, 1100, 1300]
    const breaks = chooseBreaks(rows, 1500, 1000)
    expect(breaks[0]).toBe(950)
  })

  it('never produces a page taller than the paper', () => {
    const rows = Array.from({ length: 60 }, (_, i) => (i + 1) * 73)
    const breaks = chooseBreaks(rows, 60 * 73, 1000)
    for (const s of pageSlices(breaks)) {
      expect(s.height).toBeLessThanOrEqual(1000)
    }
  })

  it('covers the whole document with no gap and no overlap', () => {
    const rows = Array.from({ length: 40 }, (_, i) => (i + 1) * 87)
    const total = 40 * 87
    const slices = pageSlices(chooseBreaks(rows, total, 1000))
    expect(slices[0].top).toBe(0)
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].top).toBe(slices[i - 1].top + slices[i - 1].height)
    }
    const last = slices[slices.length - 1]
    expect(last.top + last.height).toBe(total)
  })

  it('ends the last page exactly at the end of the content', () => {
    const breaks = chooseBreaks([500, 900, 1400], 1600, 1000)
    expect(breaks[breaks.length - 1]).toBe(1600)
  })

  it('cuts a block taller than a page rather than giving up', () => {
    // One enormous table with no safe offset inside it. A cut page beats no
    // document, so it cuts at the page edge and moves on.
    const breaks = chooseBreaks([], 2500, 1000)
    expect(breaks).toEqual([1000, 2000, 2500])
  })

  it('ignores offsets that are not inside the document', () => {
    const breaks = chooseBreaks([-50, 0, 900, 5000, Number.NaN], 1500, 1000)
    expect(breaks[0]).toBe(900)
  })

  it('does not stall when an offset lands exactly on the current start', () => {
    // A duplicate offset at the cut point must not be chosen again.
    const breaks = chooseBreaks([900, 900, 1800], 2600, 1000)
    expect(new Set(breaks).size).toBe(breaks.length)
    expect(breaks[breaks.length - 1]).toBe(2600)
  })

  it('returns nothing for a document with no height', () => {
    expect(chooseBreaks([100], 0, 1000)).toEqual([])
    expect(chooseBreaks([100], 500, 0)).toEqual([])
  })
})

describe('turning cuts into pages', () => {
  it('describes each page as a top and a height', () => {
    expect(pageSlices([950, 1900, 2400])).toEqual([
      { top: 0, height: 950 },
      { top: 950, height: 950 },
      { top: 1900, height: 500 },
    ])
  })

  it('drops an empty page rather than printing a blank sheet', () => {
    expect(pageSlices([500, 500, 900])).toEqual([
      { top: 0, height: 500 },
      { top: 500, height: 400 },
    ])
  })
})
