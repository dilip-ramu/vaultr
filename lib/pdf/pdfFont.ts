// Register the embedded Carlito subset with a jsPDF instance and expose the
// family name. Carlito (Calibri-metric-compatible, open source) carries the
// Indian Rupee sign (₹) and full Latin — jsPDF's built-in Helvetica does not,
// so amounts like ₹2,81,922.42 come out mangled without this.

import type { jsPDF as JsPDFType } from 'jspdf'
import { CARLITO_REGULAR_B64, CARLITO_BOLD_B64 } from './fonts/carlito'

/** Font family to pass to setFont once registered. */
export const PDF_FONT = 'Carlito'

/** Add the Carlito regular + bold faces to a jsPDF doc. Safe to call once per doc. */
export function registerPdfFont(doc: JsPDFType): void {
  doc.addFileToVFS('Carlito-Regular.ttf', CARLITO_REGULAR_B64)
  doc.addFont('Carlito-Regular.ttf', PDF_FONT, 'normal')
  doc.addFileToVFS('Carlito-Bold.ttf', CARLITO_BOLD_B64)
  doc.addFont('Carlito-Bold.ttf', PDF_FONT, 'bold')
  doc.setFont(PDF_FONT, 'normal')
}
