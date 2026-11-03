// Size-wise quantities. The sum of these is what a supplier cuts, so it is
// worth being sure about.

import { describe, it, expect } from 'vitest'
import {
  normaliseSizes, sizeTotal, sizeShippedTotal, hasSizes,
  lineQty, lineShipped, formatSizes, parseSizes, sizeWarning,
} from '@/lib/orders/sizes'

const SM = [{ label: 'S', qty: 200 }, { label: 'M', qty: 400 }, { label: 'L', qty: 400 }, { label: 'XL', qty: 200 }]

describe('the quantity comes from the sizes', () => {
  it('adds them up', () => {
    expect(sizeTotal(SM)).toBe(1200)
  })

  it('overrides whatever was typed on the line — one number, one source', () => {
    expect(lineQty(999, SM)).toBe(1200)
  })

  it('uses the typed quantity when there are no sizes', () => {
    expect(lineQty(850, [])).toBe(850)
    expect(lineQty(850, null)).toBe(850)
    expect(lineQty(850, undefined)).toBe(850)
  })

  it('treats a line whose sizes are all blank labels as having none', () => {
    expect(hasSizes([{ label: '  ', qty: 100 }])).toBe(false)
    expect(lineQty(850, [{ label: '', qty: 100 }])).toBe(850)
  })

  it('never goes negative', () => {
    expect(lineQty(-50, [])).toBe(0)
    expect(sizeTotal([{ label: 'S', qty: -10 }])).toBe(0)
  })
})

describe('tidying what was entered', () => {
  it('adds up a size entered twice instead of keeping both', () => {
    expect(normaliseSizes([{ label: 'S', qty: 100 }, { label: 's', qty: 50 }]))
      .toEqual([{ label: 'S', qty: 150, shippedQty: 0 }])
  })

  it('keeps the order they were entered in, not alphabetical', () => {
    expect(normaliseSizes([{ label: 'XL', qty: 1 }, { label: 'S', qty: 1 }]).map(s => s.label))
      .toEqual(['XL', 'S'])
  })

  it('drops rows with no label', () => {
    expect(normaliseSizes([{ label: '', qty: 100 }, { label: 'M', qty: 5 }]).map(s => s.label)).toEqual(['M'])
  })
})

describe('shipping size by size', () => {
  it('adds up what has gone', () => {
    expect(sizeShippedTotal([{ label: 'S', qty: 200, shippedQty: 200 }, { label: 'M', qty: 400, shippedQty: 150 }])).toBe(350)
  })

  it('cannot report more shipped than ordered', () => {
    expect(sizeShippedTotal([{ label: 'S', qty: 200, shippedQty: 500 }])).toBe(200)
  })

  it('uses the line figure when no size has been despatched yet', () => {
    expect(lineShipped(300, [])).toBe(300)
    // A line WITH sizes but no size-level despatch recorded must still report
    // what the line says has gone, or a part shipment would vanish.
    expect(lineShipped(300, SM)).toBe(300)
  })

  it('lets the sizes take over the moment they carry a figure', () => {
    expect(lineShipped(300, [{ label: 'S', qty: 200, shippedQty: 120 }])).toBe(120)
  })
})

describe('what the supplier sees', () => {
  it('writes the breakdown on one line', () => {
    expect(formatSizes(SM)).toBe('S 200 / M 400 / L 400 / XL 200')
  })

  it('leaves out a size with nothing against it', () => {
    expect(formatSizes([{ label: 'S', qty: 0 }, { label: 'M', qty: 10 }])).toBe('M 10')
  })

  it('is empty when there is nothing to say', () => {
    expect(formatSizes([])).toBe('')
  })
})

describe('typing a breakdown quickly', () => {
  it('reads the way people actually write it', () => {
    expect(parseSizes('S 200, M 400, L 400, XL 200')).toEqual(
      SM.map(s => ({ ...s, shippedQty: 0 })))
  })

  it('accepts slashes, colons and newlines', () => {
    expect(parseSizes('S:100 / M:200').map(s => [s.label, s.qty])).toEqual([['S', 100], ['M', 200]])
    expect(parseSizes('S 100\nM 200').map(s => [s.label, s.qty])).toEqual([['S', 100], ['M', 200]])
  })

  it('handles a label with a space in it', () => {
    expect(parseSizes('Age 3-4 = 120').map(s => [s.label, s.qty])).toEqual([['Age 3-4', 120]])
  })

  it('keeps a label typed without a number, at zero, so the typo is visible', () => {
    expect(parseSizes('S 100, M').map(s => [s.label, s.qty])).toEqual([['S', 100], ['M', 0]])
  })

  it('survives an empty box', () => {
    expect(parseSizes('')).toEqual([])
    expect(parseSizes('  ,  ,  ')).toEqual([])
  })

  it('round-trips with the formatter', () => {
    expect(formatSizes(parseSizes(formatSizes(SM)))).toBe(formatSizes(SM))
  })
})

describe('warning before it goes out', () => {
  it('says nothing about a line with no sizes', () => {
    expect(sizeWarning(500, [])).toBe(null)
  })

  it('says nothing when every size has a quantity', () => {
    expect(sizeWarning(0, SM)).toBe(null)
  })

  it('names the sizes left blank', () => {
    expect(sizeWarning(0, [{ label: 'S', qty: 100 }, { label: 'M', qty: 0 }, { label: 'L', qty: 0 }]))
      .toBe('No quantity against M, L.')
  })
})
