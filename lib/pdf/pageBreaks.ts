// Where to cut a long document into pages.
//
// The old way rasterised the whole sheet into one tall image and sliced it
// every 297mm, which is how a statement ended up with a page break through the
// middle of a transaction row and a balance figure sheared in half. Nobody
// reading it can tell whether that is a rendering fault or a number that has
// gone wrong, which is exactly the doubt this document exists to remove.
//
// So the page does not decide where to cut. The content does: every block and
// every table row offers a safe offset, and a page ends at the last safe offset
// that still fits.
//
// Pure, because the failure it prevents is silent — a cut row still looks like
// a page, just a wrong one.

/**
 * Cut points for a document of `totalHeight`, where no page may exceed
 * `pageHeight` and a cut should land on one of `candidates` where possible.
 *
 * Returns the END offset of each page, so the first page is 0 → result[0].
 *
 * `candidates` are offsets from the top of the content at which cutting is
 * safe — the top of a block, the top of a row. They need not be sorted.
 */
export function chooseBreaks(
  candidates: number[],
  totalHeight: number,
  pageHeight: number,
): number[] {
  if (!(totalHeight > 0) || !(pageHeight > 0)) return []

  const safe = Array.from(new Set(
    candidates
      .filter(c => Number.isFinite(c) && c > 0 && c < totalHeight)
      .map(c => Math.floor(c)),
  )).sort((a, b) => a - b)

  const breaks: number[] = []
  let start = 0
  // Bounded by construction — every iteration moves `start` forward by at least
  // one pixel — but a document is not worth an infinite loop if that ever
  // stops being true.
  let guard = 0

  while (start < totalHeight && guard++ < 10_000) {
    const limit = start + pageHeight

    if (limit >= totalHeight) {
      breaks.push(totalHeight)
      break
    }

    // The last safe cut that still fits on this page.
    let cut = -1
    for (const c of safe) {
      if (c > start && c <= limit) cut = c
      else if (c > limit) break
    }

    // No safe cut fits, which means one block is taller than a whole page.
    // Nothing can be done about that except cut it, so cut it at the page edge
    // rather than refusing to produce a document.
    breaks.push(cut > start ? cut : limit)
    start = breaks[breaks.length - 1]
  }

  return breaks
}

/** The height of each page, which is what the renderer actually crops. */
export function pageSlices(breaks: number[]): { top: number; height: number }[] {
  const out: { top: number; height: number }[] = []
  let top = 0
  for (const b of breaks) {
    out.push({ top, height: b - top })
    top = b
  }
  return out.filter(s => s.height > 0)
}
