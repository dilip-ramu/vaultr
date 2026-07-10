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

async function canvasToPdfDownload(el: HTMLElement, filename: string) {
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
  pdf.save(filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** Download an on-screen element as a PDF. */
export async function downloadElementPdf(el: HTMLElement, filename: string): Promise<void> {
  await canvasToPdfDownload(el, filename)
}

/**
 * Download a print route (e.g. an invoice) as a PDF WITHOUT navigating away:
 * render it in a hidden off-screen iframe, capture the A4 sheet, then download.
 */
export async function downloadPrintRouteAsPdf(printUrl: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1400px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve()
      iframe.onerror = () => reject(new Error('could not load the invoice'))
      iframe.src = printUrl
    })
    // Give fonts, the logo image and the layout a moment to settle.
    await new Promise(r => setTimeout(r, 1000))
    const doc = iframe.contentDocument
    if (!doc) throw new Error('render document unavailable')
    const el = pickSheet(doc)
    if (!el) throw new Error('invoice element not found')
    await canvasToPdfDownload(el, filename)
  } finally {
    iframe.remove()
  }
}
