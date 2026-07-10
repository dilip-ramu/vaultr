// Client-side "download as PDF" of an on-screen A4 document element (the .vinv
// .sheet the invoice/doc renderers produce). Rasterises the element with
// html2canvas and lays it into a multi-page A4 PDF via jsPDF. Dynamically
// imported so the (large) libs never load until the user actually downloads.

export async function downloadElementPdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const img = canvas.toDataURL('image/jpeg', 0.95)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()   // 210
  const pageH = pdf.internal.pageSize.getHeight()  // 297
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

/** Find the rendered A4 sheet on the current print page. */
export function findDocSheet(): HTMLElement | null {
  return (document.querySelector('.vinv .sheet') as HTMLElement | null) ?? (document.querySelector('.vinv') as HTMLElement | null)
}
