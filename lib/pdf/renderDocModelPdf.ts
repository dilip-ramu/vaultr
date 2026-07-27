// Text-based PDF for a document, drawn straight from the DocModel with jsPDF's
// text primitives — NOT a screenshot. This is why the output is selectable text,
// one-tap to download, and paginates by content (no rasterised A4 with empty
// bands). Every string that shows on the invoice is real text in the PDF.
//
// Pagination rule: the line-item table flows down the page; when it runs out of
// room a new page starts and ONLY the column header repeats (never the whole
// letterhead). The totals / bank / terms / signature block follows the table
// wherever it ends — it is not pinned to the bottom of the page, so there are no
// large gaps.

import type { DocModel, DocColumn } from '@/lib/documents/model'

const A4 = { w: 210, h: 297 }
const M = 14                     // page margin (mm)
const CONTENT_W = A4.w - M * 2
const BOTTOM = A4.h - M          // y beyond which we must break to a new page

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [31, 92, 58]
}

/** Load an image URL to a data URL so jsPDF can embed it. Null on any failure —
 *  a missing logo must never block the whole PDF. */
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

export async function downloadDocModelPdf(model: DocModel, filename: string): Promise<void> {
  const doc = await buildDocModelPdf(model)
  doc.save(filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** Same text PDF as a Blob (for the GST bulk-zip export). */
export async function docModelPdfBlob(model: DocModel): Promise<Blob> {
  const doc = await buildDocModelPdf(model)
  return doc.output('blob') as Blob
}

async function buildDocModelPdf(model: DocModel) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const accent = hexToRgb(model.accent)
  const GREY: [number,number,number] = [120,120,120]
  const DARK: [number,number,number] = [30,30,30]

  const [logo, signature] = await Promise.all([loadImage(model.logoUrl), loadImage(model.signatureUrl)])

  // ── Column geometry from the model's flex weights ──────────────────────────
  const cols = model.columns
  const totalFlex = cols.reduce((t, c) => t + (c.flex ?? 1), 0)
  const colW = cols.map(c => (CONTENT_W * (c.flex ?? 1)) / totalFlex)
  const colX: number[] = []
  cols.reduce((x, _c, i) => { colX[i] = x; return x + colW[i] }, M)
  const PAD = 1.6
  const cellX = (i: number, align: DocColumn['align']) =>
    align === 'right' ? colX[i] + colW[i] - PAD : align === 'center' ? colX[i] + colW[i] / 2 : colX[i] + PAD

  let y = M

  // ── Accent strip ───────────────────────────────────────────────────────────
  doc.setFillColor(...accent); doc.rect(0, 0, A4.w, 2.5, 'F')
  y = M

  // ── Header: logo + company (left), title + number + date (right) ───────────
  const headTop = y
  if (logo) {
    const lw = 45, lh = Math.min(22, (logo.h / logo.w) * lw)
    doc.addImage(logo.data, 'PNG', M, y, lw, lh)
    y += lh + 3
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...DARK)
  doc.text(model.companyName || '', M, y + 4)
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY)
  for (const line of model.companyLines ?? []) { doc.text(line, M, y); y += 4 }

  // Right column: title, number, date
  let ry = headTop + 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...accent)
  doc.text(model.title || '', A4.w - M, ry + 4, { align: 'right' })
  ry += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY)
  if (model.number) { doc.text(model.number, A4.w - M, ry, { align: 'right' }); ry += 4.5 }
  for (const m of model.meta ?? []) {
    if (!m.value) continue
    doc.text(`${m.label}: ${m.value}`, A4.w - M, ry, { align: 'right' }); ry += 4.5
  }

  y = Math.max(y, ry) + 4

  // ── Bill-to parties ─────────────────────────────────────────────────────────
  for (const p of model.parties ?? []) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(150,150,150)
    doc.text(p.label.toUpperCase(), M, y); y += 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK)
    doc.text(p.name || '', M, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY)
    for (const l of p.lines ?? []) { doc.text(doc.splitTextToSize(l, CONTENT_W), M, y); y += 4 }
    y += 2
  }
  y += 2

  // ── Line-item table ─────────────────────────────────────────────────────────
  const LINE = 4.2
  function drawTableHeader() {
    doc.setFillColor(...accent.map(c => Math.round(c + (255 - c) * 0.9)) as [number, number, number])
    doc.rect(M, y, CONTENT_W, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...accent)
    cols.forEach((c, i) => doc.text(c.label, cellX(i, c.align), y + 4.6, { align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' }))
    y += 7
  }
  drawTableHeader()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50,50,50)
  for (const r of model.rows) {
    // Measure the tallest wrapped cell so the row never clips.
    const wrapped = cols.map((c, i) => doc.splitTextToSize(String(r.cells[c.key] ?? ''), colW[i] - PAD * 2))
    const rowH = Math.max(6, ...wrapped.map(w => w.length * LINE + 2))

    if (y + rowH > BOTTOM) { doc.addPage(); y = M; drawTableHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50,50,50) }

    if (r.strong) { doc.setFillColor(250,250,250); doc.rect(M, y, CONTENT_W, rowH, 'F'); doc.setFont('helvetica', 'bold') }
    doc.setTextColor(r.danger ? 192 : (r.strong ? 17 : 51), r.danger ? 57 : (r.strong ? 17 : 51), r.danger ? 43 : (r.strong ? 17 : 51))
    cols.forEach((c, i) => {
      doc.text(wrapped[i], cellX(i, c.align), y + 4, { align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' })
    })
    if (r.strong) doc.setFont('helvetica', 'normal')
    doc.setDrawColor(238,238,238); doc.line(M, y + rowH, A4.w - M, y + rowH)
    y += rowH
  }
  y += 6

  // ── Totals block (keep together; break if it won't fit) ────────────────────
  const blockH = 10 + (model.totals?.length ?? 0) * 5 + 12 + (model.inWords ? 10 : 0)
  if (y + blockH > BOTTOM) { doc.addPage(); y = M }

  const rightX = A4.w - M
  const labelX = A4.w - M - 60
  if (model.inWords) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GREY)
    doc.text('In words:', M, y)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(model.inWords, 95), M + 16, y)
  }
  doc.setFontSize(9); doc.setTextColor(90,90,90)
  for (const t of model.totals ?? []) {
    doc.setFont('helvetica', 'normal')
    doc.text(t.label, labelX, y); doc.text(t.value, rightX, y, { align: 'right' })
    y += 5
  }
  if (model.grandValue) {
    y += 1
    doc.setDrawColor(...accent); doc.line(labelX, y, rightX, y); y += 5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK)
    doc.text(model.grandLabel ?? 'TOTAL', labelX, y)
    doc.setTextColor(...accent); doc.setFontSize(14)
    doc.text(model.grandValue, rightX, y, { align: 'right' })
    y += 8
  }

  // ── Footer: bank + terms (left), signature (right) ─────────────────────────
  y += 4
  if (y + 30 > BOTTOM) { doc.addPage(); y = M }
  const footTop = y
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY)
  for (const l of model.bankLines ?? []) { doc.text(l, M, y); y += 4 }
  if (model.terms) {
    y += 2
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(150,150,150)
    doc.text('TERMS & CONDITIONS', M, y); y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY)
    const tl = doc.splitTextToSize(model.terms, CONTENT_W * 0.55)
    doc.text(tl, M, y); y += tl.length * 3.4
  }
  // Signature, right side, aligned to the footer's top.
  let sy = footTop
  if (signature) {
    const sw = 40, sh = Math.min(20, (signature.h / signature.w) * sw)
    doc.addImage(signature.data, 'PNG', rightX - sw, sy, sw, sh)
    sy += sh + 3
  } else { sy += 16 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY)
  doc.text(model.signatureLabel ?? 'Authorised signatory', rightX, sy, { align: 'right' })

  return doc
}
