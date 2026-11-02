// The overlap bug: a wrapped text block was drawn in full but `y` advanced by
// one line, so the next block landed on the wrapped tail. In the purchase
// order PDF that put the GSTIN line on top of the second line of the address.

import { describe, it, expect } from 'vitest'
import { layoutTextBlock, layoutText, sideBySideHeight } from '@/lib/pdf/textBlock'

/** Stand-in for jsPDF's splitTextToSize: ~2mm per character. */
const wrap = (text: string, width: number): string[] => {
  const perLine = Math.max(1, Math.floor(width / 2))
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > perLine && cur) { out.push(cur); cur = w } else { cur = next }
  }
  if (cur) out.push(cur)
  return out
}

describe('laying out a text block', () => {
  it('reserves room for every wrapped line, not just the first', () => {
    // 60 characters at 20mm wide (10 chars a line) must wrap to several lines.
    const long = 'No 44 Kumaran Road Tiruppur Tamil Nadu 641601 India'
    const b = layoutTextBlock([long], 20, 4, wrap)
    expect(b.lines.length).toBeGreaterThan(1)
    expect(b.height).toBe(b.lines.length * 4)
  })

  it('is the bug: one line of advance for a block that wrapped would overlap', () => {
    const b = layoutTextBlock(['a very long company address that has to wrap'], 20, 4, wrap)
    // The old code advanced 4mm per ENTRY. The block is taller than that, and
    // that difference is exactly the overlap.
    expect(b.height).toBeGreaterThan(4)
  })

  it('adds up several entries', () => {
    const b = layoutTextBlock(['short', 'also short'], 200, 4, wrap)
    expect(b.lines).toEqual(['short', 'also short'])
    expect(b.height).toBe(8)
  })

  it('drops blank entries so an empty address line leaves no gap', () => {
    const b = layoutTextBlock(['one', '', '   ', null, undefined, 'two'], 200, 4, wrap)
    expect(b.lines).toEqual(['one', 'two'])
    expect(b.height).toBe(8)
  })

  it('is empty, and zero-height, when there is nothing to draw', () => {
    expect(layoutTextBlock([], 100, 4, wrap)).toEqual({ lines: [], height: 0 })
    expect(layoutTextBlock(['', null], 100, 4, wrap)).toEqual({ lines: [], height: 0 })
  })

  it('does not try to wrap to a nonsense width', () => {
    const b = layoutTextBlock(['keep me'], 0, 4, wrap)
    expect(b.lines).toEqual(['keep me'])
    expect(b.height).toBe(4)
  })

  it('never returns a negative height', () => {
    expect(layoutTextBlock(['x'], 100, -5, wrap).height).toBe(0)
  })

  it('layoutText is the single-string form', () => {
    expect(layoutText('hello', 200, 3, wrap)).toEqual({ lines: ['hello'], height: 3 })
    expect(layoutText(null, 200, 3, wrap)).toEqual({ lines: [], height: 0 })
  })
})

describe('two blocks drawn side by side', () => {
  it('clears the taller of the two', () => {
    expect(sideBySideHeight(12, 30)).toBe(30)
    expect(sideBySideHeight(30, 12)).toBe(30)
    expect(sideBySideHeight(0, 0)).toBe(0)
  })
})
