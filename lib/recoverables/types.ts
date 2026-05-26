// ── DB row types ────────────────────────────────────────────

export type BatchStatus = 'pending' | 'processed' | 'failed'
export type AllocationStatus = 'pending' | 'billed' | 'paid' | 'cancelled'
export type MarkupType = 'percentage' | 'flat' | 'none'

export interface ImportBatch {
  id: string
  user_id: string
  name: string
  source: string | null
  import_date: string
  currency: string
  csv_path: string | null
  row_count: number
  reference_count: number
  supplier_count: number
  total_cost: number
  total_recoverable: number
  status: BatchStatus
  validation_errors: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecoverableShipment {
  id: string
  user_id: string
  batch_id: string
  reference: string
  total_cost: number
  total_pieces: number
  per_piece_cost: number
  source: string | null
  shipment_date: string | null
  destination: string | null
  weight_kg: number | null
  raw_row: Record<string, unknown> | null
  created_at: string
}

export interface RecoverableAllocation {
  id: string
  user_id: string
  batch_id: string
  shipment_id: string
  customer_id: string | null
  supplier_name: string
  pieces: number
  base_cost: number
  markup_type: MarkupType
  markup_value: number
  markup_amount: number
  recoverable_amount: number
  status: AllocationStatus
  billed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── CSV parsing types ────────────────────────────────────────

export interface RawCSVRow {
  rowIndex: number
  reference: string
  totalCost: number
  totalPcs: number
  shipmentDate: string | null        // yyyy-mm-dd or null
  suppliers: Record<string, number>  // supplierName → pieces
  raw: Record<string, string>        // original values for error display
}

export interface RowValidationError {
  rowIndex: number
  reference: string
  field: string
  message: string
}

export interface CSVParseResult {
  supplierColumns: string[]
  rows: RawCSVRow[]
  errors: RowValidationError[]
  isValid: boolean
}

// ── Engine types ─────────────────────────────────────────────

export interface ParsedAllocation {
  supplierName: string
  pieces: number
  baseCost: number
  markupType: MarkupType
  markupValue: number
  markupAmount: number
  recoverableAmount: number
}

export interface ParsedShipment {
  reference: string
  totalCost: number
  totalPieces: number
  perPieceCost: number
  shipmentDate: string | null
  allocations: ParsedAllocation[]
}

export interface ProcessingResult {
  batchId: string
  referenceCount: number
  supplierCount: number
  allocationCount: number
  totalCost: number
  totalRecoverable: number
  errors: string[]
}

// ── Dashboard types ──────────────────────────────────────────

export interface SupplierBalance {
  supplierName: string
  customerId: string | null
  pendingAmount: number
  billedAmount: number
  paidAmount: number
  totalAmount: number
  allocationCount: number
  lastActivity: string | null
}

export interface DashboardStats {
  totalPending: number
  totalBilled: number
  totalPaid: number
  batchCount: number
  supplierCount: number
  currency: string
}
