// Bundle every document in a GST return into one zip of PDFs.
//
// The PDFs don't exist anywhere as files — each one is rendered on demand from
// its print route. So this walks the return's rows, renders each document in a
// hidden iframe, and drops the resulting PDF into a zip. That's slow (about a
// second a document) but it's honest: every PDF in the zip is byte-for-byte the
// one you'd get by hitting Download on that invoice.
//
// Rendering is sequential on purpose. Parallel iframes fight over fonts and
// images and produce half-drawn pages — a wrong PDF is worse than a slow one.

import { printRouteToPdfBlob } from '@/lib/pdf/downloadElementPdf'
import type { Gstr1, Gstr1Row, Section } from './returns'
import { printPath } from './returns'

export interface ZipProgress {
  done: number
  total: number
  current: string
}

/** Folder each section's PDFs land in, so the zip mirrors the return. */
const FOLDER: Record<Section, string> = {
  b2b: 'B2B',
  b2cl: 'B2C-Large',
  b2cs: 'B2C-Small',
  cdnr: 'Credit-Debit-Notes',
  cdnur: 'Credit-Debit-Notes-Unregistered',
}

/** Windows and macOS both choke on these in a filename. */
const safe = (s: string) => (s || 'document').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()

export function zipFileName(row: Gstr1Row): string {
  const party = safe(row.party).slice(0, 40)
  return `${FOLDER[row.section]}/${safe(row.number)} — ${party}.pdf`
}

/**
 * Render every document in the return and return a zip blob.
 *
 * A document that fails to render does NOT sink the whole zip — it's collected
 * and reported, and the zip still contains everything that did render, plus a
 * FAILED.txt naming what's missing. Silently shipping an incomplete zip of tax
 * documents would be the worst possible outcome.
 */
export async function zipReturnInvoices(
  gstr1: Gstr1,
  opts: { sections?: Section[]; onProgress?: (p: ZipProgress) => void } = {},
): Promise<{ blob: Blob; failed: { number: string; reason: string }[]; count: number }> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  const rows = opts.sections?.length
    ? gstr1.rows.filter(r => opts.sections!.includes(r.section))
    : gstr1.rows

  const failed: { number: string; reason: string }[] = []
  let done = 0

  for (const row of rows) {
    opts.onProgress?.({ done, total: rows.length, current: row.number })
    try {
      const blob = await printRouteToPdfBlob(printPath(row))
      zip.file(zipFileName(row), blob)
    } catch (e) {
      failed.push({ number: row.number, reason: (e as Error).message })
    }
    done++
    opts.onProgress?.({ done, total: rows.length, current: row.number })
  }

  if (failed.length) {
    zip.file(
      'FAILED.txt',
      [
        'These documents could not be rendered and are NOT in this zip:',
        '',
        ...failed.map(f => `  ${f.number} — ${f.reason}`),
        '',
        'Open each one in the app and download it individually.',
      ].join('\n'),
    )
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { blob, failed, count: rows.length - failed.length }
}
