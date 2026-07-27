// Text-based PDF for a COMPANY'S CUSTOM TEMPLATE. Draws a coordinate layout
// (DocLayout) with jsPDF text primitives — NOT a screenshot. It is the text
// twin of <LayoutRenderer>: same element positions, same data (LayoutContext),
// same pagination (all the WHERE maths comes from the shared, tested flow.ts).
// The output is selectable text that still follows the company's template.

import type { jsPDF as JsPDFType } from 'jspdf'
import type { DocLayout, LayoutEl } from '@/lib/documents/layout'
import { pxToMm, pxToPt } from '@/lib/documents/layout'
import type { LayoutContext } from '@/lib/documents/layoutContext'
import {
  ROW_H, HEAD_H, elText, measuredHeight, computeShifts, tableBoxOn, paginate, onPage, withGstGuard,
} from '@/lib/documents/flow'
import { PDF_FONT, registerPdfFont } from './pdfFont'

const PT_TO_MM = 25.4 / 72

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim())
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  // three-digit shorthand
  const s = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec((hex || '').trim())
  if (s) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)]
  return [17, 17, 17]
}

function resolveColor(c: string | undefined, accent: string): [number, number, number] {
  if (!c) return [17, 17, 17]
  return c === 'accent' ? hexToRgb(accent) : hexToRgb(c)
}

/** tint a colour toward white by t (0..1) — matches color-mix(accent 8%, #fff). */
function tint([r, g, b]: [number, number, number], t: number): [number, number, number] {
  return [Math.round(r + (255 - r) * t), Math.round(g + (255 - g) * t), Math.round(b + (255 - b) * t)]
}

async function loadImage(url: string | null | undefined): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    return { data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch { return null }
}

/** All image URLs a layout can reference, preloaded once. */
async function preloadImages(layout: DocLayout, ctx: LayoutContext) {
  const srcs = new Set<string>()
  for (const el of layout.elements) {
    if (el.type === 'image' && el.src) srcs.add(el.src)
    if (el.type === 'logo' && ctx.logoUrl) srcs.add(ctx.logoUrl)
    if (el.type === 'signature' && ctx.signatureUrl) srcs.add(ctx.signatureUrl)
  }
  const out = new Map<string, { data: string; w: number; h: number }>()
  await Promise.all([...srcs].map(async s => { const im = await loadImage(s); if (im) out.set(s, im) }))
  return out
}

const jset = (doc: JsPDFType, sizePt: number, bold: boolean, rgb: [number, number, number]) => {
  doc.setFont(PDF_FONT, bold ? 'bold' : 'normal')
  doc.setFontSize(sizePt)
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

export async function downloadLayoutPdf(layout: DocLayout, rawCtx: LayoutContext, filename: string): Promise<void> {
  const doc = await buildLayoutPdf(layout, rawCtx)
  doc.save(filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** Same custom-template text PDF as a Blob (for the GST bulk-zip export). */
export async function layoutPdfBlob(layout: DocLayout, rawCtx: LayoutContext): Promise<Blob> {
  const doc = await buildLayoutPdf(layout, rawCtx)
  return doc.output('blob') as Blob
}

async function buildLayoutPdf(layout: DocLayout, rawCtx: LayoutContext) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  registerPdfFont(doc)
  const ctx = withGstGuard(layout, rawCtx)
  const accent = ctx.accent || '#1F5C3A'
  const images = await preloadImages(layout, ctx)

  const li = layout.elements.find(e => e.type === 'lineItems')
  const chunks = paginate(layout, ctx)
  const pages = li ? Math.max(1, chunks.length) : 1

  const visible = (el: LayoutEl, p: number) => el.type === 'lineItems' ? true : onPage(el, p, pages)

  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage()
    const shift = computeShifts(layout, ctx, p, pages)
    const box = tableBoxOn(layout, p, pages, shift)
    const pageRows = li ? (chunks[p] ?? []) : []
    const pageCtx: LayoutContext = li ? { ...ctx, rows: pageRows } : ctx

    const actualH = li ? Math.min(box.h, HEAD_H + pageRows.length * ROW_H) : 0
    const designedBottom = box.y + box.h
    const followDelta = li ? (box.y + actualH) - designedBottom : 0   // ≤ 0

    // Draw back-layer first, normal next, front-layer last — mirrors z-index.
    const order = layout.elements.filter(el => visible(el, p))
    const byLayer = [
      ...order.filter(e => e.layer === 'back'),
      ...order.filter(e => e.layer !== 'back' && e.layer !== 'front'),
      ...order.filter(e => e.layer === 'front'),
    ]

    for (const el of byLayer) {
      const isTable = el.type === 'lineItems'
      const pinned = (el.on ?? 'first') === 'all'
      const follows = !isTable && !pinned && li != null && el.y >= designedBottom
      const topPx = isTable ? box.y : el.y + (shift.get(el.id) ?? 0) + (follows ? followDelta : 0)

      const x = pxToMm(el.x)
      const y = pxToMm(topPx)
      const w = pxToMm(el.w)
      const h = pxToMm(isTable ? actualH : el.h)
      drawEl(doc, el, pageCtx, accent, images, x, y, w, h)
    }
  }

  return doc
}

function drawEl(
  doc: JsPDFType, el: LayoutEl, ctx: LayoutContext, accent: string,
  images: Map<string, { data: string; w: number; h: number }>,
  x: number, y: number, w: number, h: number,
) {
  const accentRgb = hexToRgb(accent)

  switch (el.type) {
    case 'accentBar': {
      doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2])
      doc.rect(x, y, w, h, 'F')
      return
    }

    case 'divider': {
      const rgb = el.color ? resolveColor(el.color, accent) : ([229, 231, 235] as [number, number, number])
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]); doc.setLineWidth(0.3)
      doc.line(x, y + h / 2, x + w, y + h / 2)
      return
    }

    case 'text':
    case 'field': {
      const raw = elText(el, ctx)
      if (el.type === 'field' && !raw) return
      const sizePt = pxToPt(el.fontSize ?? 11)
      drawText(doc, raw, el, ctx, accent, x, y, w, sizePt)
      return
    }

    case 'logo':
    case 'image': {
      const src = el.type === 'logo' ? ctx.logoUrl : el.src
      const im = src ? images.get(src) : null
      if (!im) return
      placeImage(doc, im, x, y, w, h, el.type === 'logo' ? 'left' : 'fit', el.opacity)
      return
    }

    case 'signature': {
      // image bottom-ish, centered, with the "Authorised signatory" label under.
      const labelH = 5
      const im = ctx.signatureUrl ? images.get(ctx.signatureUrl) : null
      if (im) {
        let iw: number, ih: number
        const s = ctx.signatureSize
        if (s?.mode === 'width') { iw = s.mm; ih = (im.h / im.w) * iw }
        else if (s?.mode === 'height') { ih = s.mm; iw = (im.w / im.h) * ih }
        else { iw = Math.min(w, (im.w / im.h) * (h - labelH)); ih = (im.h / im.w) * iw; if (ih > h - labelH) { ih = h - labelH; iw = (im.w / im.h) * ih } }
        const ix = x + (w - iw) / 2
        const iy = y + (h - labelH) - ih
        doc.addImage(im.data, 'PNG', ix, Math.max(y, iy), iw, ih)
      } else {
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3)
        doc.line(x + w * 0.15, y + h - labelH - 1, x + w * 0.85, y + h - labelH - 1)
      }
      jset(doc, 8, false, [136, 136, 136])
      doc.text('Authorised signatory', x + w / 2, y + h - 1, { align: 'center', baseline: 'bottom' })
      return
    }

    case 'lineItems': {
      drawTable(doc, el, ctx, accent, x, y, w)
      return
    }

    case 'totals': {
      drawTotals(doc, ctx, accent, x, y, w)
      return
    }

    case 'bank': {
      const rgb = el.color ? resolveColor(el.color, accent) : ([136, 136, 136] as [number, number, number])
      const sizePt = pxToPt(el.fontSize ?? 9)
      jset(doc, sizePt, !!el.bold, rgb)
      let ly = y
      const lh = sizePt * 1.35 * PT_TO_MM
      for (const line of ctx.bankLines) {
        for (const seg of doc.splitTextToSize(line, w)) { doc.text(seg, x, ly, { baseline: 'top' }); ly += lh }
      }
      return
    }

    case 'terms': {
      if (!ctx.terms || !ctx.terms.trim()) return
      jset(doc, 6, true, [170, 170, 170])
      doc.text('TERMS & CONDITIONS', x, y, { baseline: 'top' })
      const rgb = el.color ? resolveColor(el.color, accent) : ([153, 153, 153] as [number, number, number])
      const sizePt = pxToPt(el.fontSize ?? 8)
      jset(doc, sizePt, false, rgb)
      const lh = sizePt * 1.35 * PT_TO_MM
      let ly = y + 4
      for (const seg of doc.splitTextToSize(ctx.terms, w)) { doc.text(seg, x, ly, { baseline: 'top' }); ly += lh }
      return
    }
  }
}

function drawText(
  doc: JsPDFType, raw: string, el: LayoutEl, ctx: LayoutContext, accent: string,
  x: number, y: number, w: number, sizePt: number,
) {
  const rgb = resolveColor(el.color, accent)
  const align = el.align ?? 'left'
  const ax = align === 'right' ? x + w : align === 'center' ? x + w / 2 : x
  const lh = sizePt * 1.35 * PT_TO_MM
  let ly = y

  // A leading label prints greyed, inline before the first line.
  const paragraphs = raw.split('\n')
  paragraphs.forEach((para, pi) => {
    if (pi === 0 && el.label) {
      // Draw the label + value together, wrapped as one logical line.
      jset(doc, sizePt, true, [170, 170, 170])
      const labelText = el.label + ' '
      const labelW = doc.getTextWidth(labelText)
      // Label is only clean for left-aligned; for right/center just prefix.
      if (align === 'left') {
        doc.text(labelText, x, ly, { baseline: 'top' })
        jset(doc, sizePt, !!el.bold, rgb)
        for (const seg of doc.splitTextToSize(para, Math.max(1, w - labelW))) {
          doc.text(seg, x + labelW, ly, { baseline: 'top' }); ly += lh
        }
        if (para === '') ly += lh
        return
      }
      jset(doc, sizePt, !!el.bold, rgb)
      for (const seg of doc.splitTextToSize(`${el.label} ${para}`, w)) { doc.text(seg, ax, ly, { align, baseline: 'top' }); ly += lh }
      return
    }
    jset(doc, sizePt, !!el.bold, rgb)
    const segs = doc.splitTextToSize(para === '' ? ' ' : para, w)
    for (const seg of segs) { doc.text(seg, ax, ly, { align, baseline: 'top' }); ly += lh }
  })
}

function placeImage(
  doc: JsPDFType, im: { data: string; w: number; h: number },
  x: number, y: number, w: number, h: number, mode: 'left' | 'fit', opacity?: number,
) {
  const ratio = im.w / im.h
  let iw = w, ih = w / ratio
  if (ih > h) { ih = h; iw = h * ratio }
  const ix = mode === 'left' ? x : x + (w - iw) / 2
  const iy = y + (mode === 'left' ? (h - ih) / 2 : (h - ih) / 2)
  const setG = opacity != null && opacity < 1
  // jsPDF GState for watermark opacity.
  if (setG) { const gs = (doc as unknown as { GState: new (o: object) => object }).GState; (doc as unknown as { setGState: (g: object) => void }).setGState(new gs({ opacity })) }
  doc.addImage(im.data, 'PNG', ix, Math.max(y, iy), iw, ih)
  if (setG) { const gs = (doc as unknown as { GState: new (o: object) => object }).GState; (doc as unknown as { setGState: (g: object) => void }).setGState(new gs({ opacity: 1 })) }
}

function drawTable(doc: JsPDFType, el: LayoutEl, ctx: LayoutContext, accent: string, x: number, y: number, w: number) {
  const cols = el.columns?.length ? el.columns : ctx.columns
  const totalFlex = cols.reduce((t, c) => t + (c.flex ?? 1), 0)
  const colW = cols.map(c => (w * (c.flex ?? 1)) / totalFlex)
  const colX: number[] = []
  cols.reduce((cx, _c, i) => { colX[i] = cx; return cx + colW[i] }, x)
  const PAD = 2.6
  const headMm = pxToMm(HEAD_H)
  const rowMm = pxToMm(ROW_H)
  const accentRgb = hexToRgb(accent)
  const cellX = (i: number, align?: string) =>
    align === 'right' ? colX[i] + colW[i] - PAD : align === 'center' ? colX[i] + colW[i] / 2 : colX[i] + PAD
  const jalign = (a?: string) => (a === 'right' ? 'right' : a === 'center' ? 'center' : 'left') as 'right' | 'center' | 'left'

  // outer border
  const totalH = headMm + ctx.rows.length * rowMm
  doc.setDrawColor(238, 238, 238); doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, totalH, 1.2, 1.2, 'S')

  // header
  const headTint = tint(accentRgb, 0.92)
  doc.setFillColor(headTint[0], headTint[1], headTint[2])
  doc.rect(x, y, w, headMm, 'F')
  jset(doc, 6.5, true, accentRgb)
  cols.forEach((c, i) => doc.text(c.label, cellX(i, c.align), y + headMm / 2, { align: jalign(c.align), baseline: 'middle' }))

  // rows
  let ry = y + headMm
  for (const r of ctx.rows) {
    if (r.strong) { doc.setFillColor(250, 250, 250); doc.rect(x, ry, w, rowMm, 'F') }
    doc.setDrawColor(242, 242, 242); doc.setLineWidth(0.2); doc.line(x, ry, x + w, ry)
    const rgb: [number, number, number] = r.danger ? [192, 57, 43] : r.strong ? [17, 17, 17] : [51, 51, 51]
    jset(doc, 8, !!r.strong, rgb)
    cols.forEach((c, i) => {
      const txt = String(r.cells[c.key] ?? '')
      const seg = doc.splitTextToSize(txt, colW[i] - PAD * 2)[0] ?? ''  // clamp to 1 line (renderer clamps to 2, but rows are fixed height)
      doc.text(seg, cellX(i, c.align), ry + rowMm / 2, { align: jalign(c.align), baseline: 'middle' })
    })
    ry += rowMm
  }
}

function drawTotals(doc: JsPDFType, ctx: LayoutContext, accent: string, x: number, y: number, w: number) {
  const accentRgb = hexToRgb(accent)
  let ly = y
  jset(doc, 8, false, [102, 102, 102])
  for (const t of ctx.totals) {
    doc.text(t.label, x, ly, { baseline: 'top' })
    doc.text(t.value, x + w, ly, { align: 'right', baseline: 'top' })
    ly += 5
  }
  ly += 2
  doc.setDrawColor(238, 238, 238); doc.setLineWidth(0.2); doc.line(x, ly, x + w, ly)
  ly += 3
  jset(doc, 9, true, [17, 17, 17])
  doc.text(ctx.grandLabel, x, ly, { baseline: 'top' })
  jset(doc, 14, true, accentRgb)
  doc.text(ctx.grandValue, x + w, ly, { align: 'right', baseline: 'top' })
}
