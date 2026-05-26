import type { OCRExtractionResult, OCRPipelineOptions } from './types'

// TODO: implement DHL PDF parsing
// Will extract AWB numbers and charges from courier invoice PDFs
// Output: auto-populated CSV draft for user review
export async function extractFromPDF(options: OCRPipelineOptions): Promise<OCRExtractionResult> {
  void options
  throw new Error('OCR pipeline not yet implemented')
}
