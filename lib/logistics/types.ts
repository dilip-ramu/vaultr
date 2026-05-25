import type { Customer } from '@/lib/types'

// ── Union types ────────────────────────────────────────────
export type CourierProvider = 'DHL' | 'FedEx' | 'Aramex' | 'UPS' | 'custom'
export type CourierInvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled'
export type OCRStatus = 'none' | 'queued' | 'processing' | 'done' | 'failed'
export type SupplierInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type MarkupType = 'percentage' | 'flat' | 'none'

// ── DB row interfaces ──────────────────────────────────────

export interface CourierInvoice {
  id: string
  user_id: string
  household_id: string | null
  courier_provider: CourierProvider
  invoice_number: string
  invoice_date: string
  due_date: string | null
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  status: CourierInvoiceStatus
  paid_at: string | null
  account_id: string | null
  file_path: string | null
  file_name: string | null
  file_type: string | null
  ocr_status: OCRStatus
  ocr_raw_data: Record<string, unknown> | null
  ocr_confidence: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  awbs?: AWB[]
}

export interface AWB {
  id: string
  user_id: string
  courier_invoice_id: string
  awb_number: string
  shipment_date: string | null
  destination_country: string | null
  destination_city: string | null
  receiver_name: string | null
  receiver_reference: string | null
  actual_weight: number | null
  volumetric_weight: number | null
  chargeable_weight: number | null
  weight_unit: string
  shipment_charge: number
  fuel_surcharge: number
  demand_surcharge: number
  gogreen_surcharge: number
  remote_area_charge: number
  other_charges: number
  tax_amount: number
  total_charge: number   // GENERATED ALWAYS AS STORED
  total_pieces: number
  allocated_pieces: number
  per_piece_base_cost: number | null
  service_type: string | null
  product_code: string | null
  raw_line_data: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  allocations?: AWBAllocation[]
}

export interface AWBAllocation {
  id: string
  user_id: string
  awb_id: string
  customer_id: string
  pieces: number
  weight_kg: number | null
  base_cost: number | null
  markup_type: MarkupType
  markup_value: number
  markup_amount: number | null
  billed_amount: number | null
  minimum_amount: number | null
  supplier_invoice_id: string | null
  invoiced_at: string | null
  override_amount: number | null
  override_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
}

export interface MarkupRule {
  id: string
  user_id: string
  customer_id: string
  markup_type: MarkupType
  markup_value: number
  minimum_amount: number | null
  courier_provider: CourierProvider | null   // null = applies to all
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SupplierInvoice {
  id: string
  user_id: string
  household_id: string | null
  customer_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  payment_terms: string | null
  subtotal: number
  tax_rate: number | null
  tax_amount: number
  total_amount: number
  paid_amount: number
  currency: string
  status: SupplierInvoiceStatus
  sent_at: string | null
  paid_at: string | null
  account_id: string | null
  pdf_path: string | null
  notes: string | null
  internal_notes: string | null
  created_at: string
  updated_at: string
  // joined
  customer?: Customer
  lines?: SupplierInvoiceLine[]
}

export interface SupplierInvoiceLine {
  id: string
  supplier_invoice_id: string
  awb_id: string | null
  description: string
  awb_number: string | null
  pieces: number | null
  weight_kg: number | null
  shipment_date: string | null
  destination: string | null
  unit_price: number | null
  quantity: number
  line_total: number
  sort_order: number
  created_at: string
}

// ── Calculation-specific types ─────────────────────────────

export interface AllocationInput {
  customerId: string
  customerName: string
  pieces: number
  markupType: MarkupType
  markupValue: number
  minimumAmount?: number
  overrideAmount?: number
}

export interface AllocationResult extends AllocationInput {
  baseCost: number
  markupAmount: number
  billedAmount: number
  effectiveAmount: number
  perPieceRate: number
}

export interface AWBCalculation {
  awbId: string
  awbNumber: string
  totalCharge: number
  totalPieces: number
  perPieceBaseCost: number
  allocations: AllocationResult[]
  totalBilled: number
  totalMargin: number
  marginPct: number
}
