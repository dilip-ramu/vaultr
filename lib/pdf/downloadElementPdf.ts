// Client-side "download as PDF" of an A4 document. Rasterises the rendered
// element with html2canvas-pro (handles oklch/color-mix, which the theme uses)
// and lays it into a multi-page A4 PDF via jsPDF. Dynamically imported so the
// (large) libs never load until the user actually downloads.

function pickSheet(root: Document | HTMLElement): HTMLElement | null {
  return (
    (root.querySelector('.vinv .sheet') as HTMLElement | null) ??       // legacy / template layout
    (root.querySelector('.vinv-claude > div') as HTMLElement | null) ?? // Claude 16a layout (inner A4 sheet)
    (root.querySelector('.vinv-claude') as HTMLElement | null) ??
    (root.querySelector('.vinv') as HTMLElement | null)
  )
}

/** Find the rendered A4 sheet on the current page. */
export function findDocSheet(): HTMLElement | null {
  return pickSheet(document)
}

/** Rasterise an A4 element into a jsPDF document. */
async function elementToPdf(el: HTMLElement) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const img = canvas.toDataURL('image/jpeg', 0.95)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgH = (canvas.height * pageW) / canvas.width

  let heightLeft = imgH
  let position = 0
  pdf.addImage(img, 'JPEG', 0, position, pageW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position -= pageH
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, position, pageW, imgH)
    heightLeft -= pageH
  }
  return pdf
}

const withExt = (name: string) => (name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`)

/** Download an on-screen element as a PDF. */
export async function downloadElementPdf(el: HTMLElement, filename: string): Promise<void> {
  const pdf = await elementToPdf(el)
  pdf.save(withExt(filename))
}

/**
 * Render a print route in a hidden iframe and hand back the A4 sheet element.
 * The caller decides what to do with it — download it, or fold it into a zip.
 * The iframe is always torn down, even if the render throws.
 */
async function withPrintDoc<T>(printUrl: string, fn: (doc: Document) => Promise<T>): Promise<T> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1400px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve()
      iframe.onerror = () => reject(new Error('could not load the document'))
      iframe.src = printUrl
    })
    // Give fonts, the logo image and the layout a moment to settle.
    await new Promise(r => setTimeout(r, 1000))
    const doc = iframe.contentDocument
    if (!doc) throw new Error('render document unavailable')
    return await fn(doc)
  } finally {
    iframe.remove()
  }
}

async function withPrintRoute<T>(printUrl: string, fn: (el: HTMLElement) => Promise<T>): Promise<T> {
  return withPrintDoc(printUrl, async doc => {
    const el = pickSheet(doc)
    if (!el) throw new Error('document element not found')
    return fn(el)
  })
}

/** Read a JSON <script> the print page embeds (see DocPrintView). */
function readEmbeddedJson(doc: Document, id: string): unknown | null {
  const tag = doc.getElementById(id)
  if (!tag?.textContent) return null
  try { return JSON.parse(tag.textContent) } catch { return null }
}

/**
 * Download a print route as a TEXT-based PDF: render it off-screen, read the
 * embedded model (+ layout), and draw it with jsPDF text primitives — selectable
 * text, no rasterised whitespace. When the company has a custom coordinate
 * template it is drawn as text too (renderLayoutPdf), so the PDF still follows
 * the template. Falls back to a screenshot only if no model is on the page.
 */
export async function downloadRouteAsTextPdf(printUrl: string, filename: string): Promise<void> {
  await withPrintDoc(printUrl, async doc => {
    const model = readEmbeddedJson(doc, 'doc-model-json') as import('@/lib/documents/model').DocModel | null
    const layout = readEmbeddedJson(doc, 'doc-layout-json') as import('@/lib/documents/layout').DocLayout | null

    if (model && layout) {
      // Company's custom template, drawn as text.
      const [{ downloadLayoutPdf }, { modelToContext }] = await Promise.all([
        import('@/lib/pdf/renderLayoutPdf'),
        import('@/lib/documents/layoutContext'),
      ])
      await downloadLayoutPdf(layout, modelToContext(model), filename)
      return
    }
    if (model) {
      // Built-in design, drawn as text.
      const { downloadDocModelPdf } = await import('@/lib/pdf/renderDocModelPdf')
      await downloadDocModelPdf(model, filename)
      return
    }
    // No model on the page → fall back to rasterising the sheet.
    const el = pickSheet(doc)
    if (!el) throw new Error('document element not found')
    const pdf = await elementToPdf(el)
    pdf.save(withExt(filename))
  })
}

/** Render a print route straight to a PDF blob — no download, no new tab. */
export async function printRouteToPdfBlob(printUrl: string): Promise<Blob> {
  return withPrintRoute(printUrl, async el => {
    const pdf = await elementToPdf(el)
    return pdf.output('blob') as Blob
  })
}

/**
 * Render a print route to a TEXT-based PDF blob (selectable text, follows the
 * company's template). Used by the GST bulk-zip export so every document in the
 * zip is text, not a screenshot. Falls back to rasterising if no model is found.
 */
export async function routeToTextPdfBlob(printUrl: string): Promise<Blob> {
  return withPrintDoc(printUrl, async doc => {
    const model = readEmbeddedJson(doc, 'doc-model-json') as import('@/lib/documents/model').DocModel | null
    const layout = readEmbeddedJson(doc, 'doc-layout-json') as import('@/lib/documents/layout').DocLayout | null
    if (model) {
      if (layout) {
        const [{ layoutPdfBlob }, { modelToContext }] = await Promise.all([
          import('@/lib/pdf/renderLayoutPdf'),
          import('@/lib/documents/layoutContext'),
        ])
        return layoutPdfBlob(layout, modelToContext(model))
      }
      const { docModelPdfBlob } = await import('@/lib/pdf/renderDocModelPdf')
      return docModelPdfBlob(model)
    }
    const el = pickSheet(doc)
    if (!el) throw new Error('document element not found')
    const pdf = await elementToPdf(el)
    return pdf.output('blob') as Blob
  })
}

/**
 * Download a print route (e.g. an invoice) as a PDF WITHOUT navigating away:
 * render it in a hidden off-screen iframe, capture the A4 sheet, then download.
 */
export async function downloadPrintRouteAsPdf(printUrl: string, filename: string): Promise<void> {
  await withPrintRoute(printUrl, async el => {
    const pdf = await elementToPdf(el)
    pdf.save(withExt(filename))
  })
}
