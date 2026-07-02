import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

/** Render a .docx template (buffer) with the given data, using {{ }}
 *  delimiters. Server-side only (Node). Unknown placeholders render empty
 *  rather than throwing, so a template referencing a tag we don't supply
 *  still produces a document. */
export function renderContractDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(templateBuffer)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}
