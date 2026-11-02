// How a block of text is laid out in a PDF, kept away from jsPDF.
//
// The bug this exists to kill: jsPDF's `splitTextToSize` returns an ARRAY of
// wrapped lines, and `doc.text(array, x, y)` happily draws all of them going
// down the page. The caller then advanced `y` by ONE line's height — so the
// next block was drawn on top of the wrapped tail. That is why letters
// overlapped in the purchase-order PDF: the company address wrapped to two
// lines, and the GSTIN line landed on the second one.
//
// A renderer cannot be unit-tested without a browser, so the arithmetic that
// decides where the next block starts lives here instead, pure, with the
// wrapper passed in. Every text block in every generated document goes
// through this, which is the only way "it cannot overlap in any of the
// generated pdfs" can actually hold.

/** Wraps one string to `width`, returning one entry per visual line.
 *  In the renderer this is jsPDF's `splitTextToSize`. */
export type WrapFn = (text: string, width: number) => string[]

export interface TextBlock {
  /** Every visual line, in order, ready to hand to `doc.text`. */
  lines: string[]
  /** How far `y` must advance so nothing can be drawn over these lines. */
  height: number
}

/**
 * Lay out `texts` (each may wrap) into a single block.
 *
 * `lineH` is the distance between two visual lines in mm. The height is
 * exactly `lines.length * lineH` — no fudge — so a caller that draws at `y`
 * and continues at `y + height` can never collide.
 *
 * Blank and whitespace-only entries are dropped: an empty address line should
 * not leave a gap, and `splitTextToSize('')` returns `['']` which would
 * otherwise count as a line.
 */
export function layoutTextBlock(
  texts: readonly (string | null | undefined)[],
  width: number,
  lineH: number,
  wrap: WrapFn,
): TextBlock {
  const lines: string[] = []
  for (const t of texts) {
    const s = typeof t === 'string' ? t.trim() : ''
    if (!s) continue
    const w = width > 0 ? wrap(s, width) : [s]
    for (const l of Array.isArray(w) ? w : [w]) {
      if (typeof l === 'string') lines.push(l)
    }
  }
  return { lines, height: lines.length * Math.max(0, lineH) }
}

/** Same, for one string. */
export function layoutText(text: string | null | undefined, width: number, lineH: number, wrap: WrapFn): TextBlock {
  return layoutTextBlock([text], width, lineH, wrap)
}

/**
 * Two blocks drawn side by side from the same `y`: the next thing must clear
 * BOTH, so the advance is the taller one. (The header draws the company block
 * on the left and the title/number block on the right; the totals block draws
 * "in words" on the left and the amounts on the right.)
 */
export function sideBySideHeight(leftHeight: number, rightHeight: number): number {
  return Math.max(leftHeight, rightHeight)
}
