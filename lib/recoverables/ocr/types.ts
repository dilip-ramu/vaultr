export interface OCRExtractionResult {
  references: string[]
  costs: Record<string, number>
  confidence: number
  rawText: string
  parseMethod: 'regex' | 'ai'
}

export interface OCRPipelineOptions {
  provider: string
  filePath: string
  fileType: 'pdf' | 'image'
}
