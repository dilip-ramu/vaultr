// ── Supplier module TypeScript types ─────────────────────────────────────────

export type PaymentTerms = 'immediate' | '7' | '15' | '30' | '45' | '60' | 'custom'

export type SupplierInvoiceStatus = 'pending' | 'due' | 'overdue' | 'paid' | 'partial' | 'cancelled'

export type RecoverableStatus =
  | 'pending_billing'
  | 'billed'
  | 'recovered'
  | 'partial_recovery'
  | 'written_off'

export interface Supplier {
  id: string
  user_id: string
  supplier_code: string | null
  name: string
  contact_person: string | null
  mobile: string | null
  email: string | null
  address: string | null
  gst_number: string | null
  pan_number: string | null
  bank_name: string | null
  account_number: string | null
  ifsc_swift: string | null
  payment_terms: PaymentTerms
  custom_terms_days: number | null
  currency: string
  notes: string | null
  is_active: boolean
  default_category_id: string | null
  created_at: string
  updated_at: string
}

// Extended with computed finance stats
export interface SupplierWithStats extends Supplier {
  total_invoices: number
  pending_invoices: number
  overdue_invoices: number
  outstanding_amount: number
  total_paid: number
  total_recoverable: number
  last_payment_date: string | null
}

export interface SupplierInvoice {
  id: string
  user_id: string
  supplier_id: string
  invoice_number: string | null
  invoice_date: string
  due_date: string | null
  amount: number
  currency: string
  category: string | null
  notes: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  is_recoverable: boolean
  linked_customer_name: string | null
  billed_to_customer: boolean
  recoverable_status: RecoverableStatus | null
  recoverable_notes: string | null
  billed_invoice_ref: string | null
  recovered_date: string | null
  is_recurring: boolean
  recurrence_interval: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  recurrence_end_date: string | null
  auto_pay_account_id: string | null
  skip_next_autopay: boolean
  is_paid: boolean
  payment_date: string | null
  payment_reference: string | null
  bulk_payment_batch_id: string | null
  status: SupplierInvoiceStatus
  created_at: string
  updated_at: string
  // auto-import from email
  source_email_document_id: string | null
  auto_imported: boolean | null
  import_date: string | null
  extraction_confidence: number | null
  // joined
  supplier?: Supplier
}

export interface BulkPaymentBatch {
  id: string
  user_id: string
  batch_reference: string
  payment_date: string
  bank_reference: string | null
  total_amount: number
  invoice_count: number
  notes: string | null
  created_at: string
  // joined
  invoices?: SupplierInvoice[]
}

// ── Computed / view helpers ───────────────────────────────────────────────────

export function computeInvoiceStatus(inv: Pick<SupplierInvoice, 'is_paid' | 'due_date' | 'status'>): SupplierInvoiceStatus {
  if (inv.is_paid) return 'paid'
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.due_date) {
    const due = new Date(inv.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (due < today) return 'overdue'
    const sevenDays = new Date(today)
    sevenDays.setDate(sevenDays.getDate() + 7)
    if (due <= sevenDays) return 'due'
  }
  return 'pending'
}

export function calcDueDateFromTerms(invoiceDate: string, terms: PaymentTerms, customDays?: number | null): string | null {
  const days = terms === 'immediate' ? 0
    : terms === 'custom' ? (customDays ?? 30)
    : parseInt(terms, 10)
  if (isNaN(days)) return null
  const d = new Date(invoiceDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: '7',         label: '7 Days' },
  { value: '15',        label: '15 Days' },
  { value: '30',        label: '30 Days' },
  { value: '45',        label: '45 Days' },
  { value: '60',        label: '60 Days' },
  { value: 'custom',    label: 'Custom' },
]

export const INVOICE_CATEGORIES = [
  'Courier',
  'Testing',
  'Sampling',
  'Trims',
  'Development',
  'Logistics',
  'Inspection',
  'Labelling',
  'Packaging',
  'Freight',
  'Other',
]

export const RECOVERABLE_STATUS_LABELS: Record<RecoverableStatus, string> = {
  pending_billing:  'Pending Billing',
  billed:           'Billed',
  recovered:        'Recovered',
  partial_recovery: 'Partial Recovery',
  written_off:      'Written Off',
}

export const INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  pending:   'Pending',
  due:       'Due Soon',
  overdue:   'Overdue',
  paid:      'Paid',
  partial:   'Partial',
  cancelled: 'Cancelled',
}
