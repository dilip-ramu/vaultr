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
  client_name: string | null
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
  customer_name: string
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
  clientName: string | null          // consignee / client from CSV
  suppliers: Record<string, number>  // supplierName → pieces
  supplierInvoiceRefs: string | null // raw value from "Supplier Invoice Refs" CSV column
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
  clientName: string | null
  supplierInvoiceRefs: string | null // from CSV column; comma-separated invoice numbers
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
  customerName: string
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
  customerCount: number
  currency: string
}

// ── Invoice types ────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled'

export interface RecoverableInvoice {
  id: string
  user_id: string
  invoice_number: string
  customer_name: string
  customer_id: string | null
  customer_address: string | null
  customer_gstin: string | null
  customer_state: string | null
  invoice_date: string
  due_date: string | null
  payment_terms: string | null
  markup_type: string
  markup_value: number
  subtotal: number
  cgst_rate: number
  sgst_rate: number
  cgst_amount: number
  sgst_amount: number
  total: number
  paid_amount: number
  balance_due: number
  status: InvoiceStatus
  notes: string | null
  currency: string
  sent_at: string | null
  paid_at: string | null
  /** 'claude' → new 16a layout; null/'legacy' → existing template layout. */
  design_version?: string | null
  created_at: string
  updated_at: string
}

export interface RecoverableInvoiceLine {
  id: string
  user_id: string
  invoice_id: string
  allocation_id: string | null
  line_number: number
  awb: string
  /** Free-typed line label (typed tax invoices). When set, the PDF shows this
   *  instead of the courier date/consignee/AWB block. */
  description?: string | null
  /** 'tax_invoice_line' for free-typed lines; null for courier shipment lines. */
  item_type?: string | null
  client_name: string | null
  shipment_date: string | null
  hsn_sac: string | null
  qty: number
  base_rate: number
  rate: number
  amount: number
  cgst_rate: number
  cgst_amount: number
  sgst_rate: number
  sgst_amount: number
}
