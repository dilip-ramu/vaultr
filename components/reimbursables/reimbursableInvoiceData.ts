// What a reimbursable invoice is made of.
//
// These two shapes used to live inside the react-pdf version of this invoice,
// which no longer renders anything: the PDF has come from the print route and
// the shared document design since ReimbursableDownloadButton was written.
// The only thing still reaching into that file was this type, so it moved
// here and the react-pdf layout was parked.
//
// Types only. No React, no renderer.

export interface InvoiceItem {
  item_type: 'salary' | 'courier' | 'expense' | 'fixed_expense' | 'deduction'
  description: string
  salary_amount?: number | null   // salary lines: EUR amount
  expended_rate?: number | null // kept for DB compat, unused in display
  amount_inr: number            // billing amount in EUR (field name legacy)
  inr_source?: number | null    // original INR amount (courier/expense, display only)
  forex_rate?: number | null    // rate used (courier/expense, display only)
  sort_order: number
}

export interface ReimbursableInvoiceData {
  invoice_number: string
  invoice_month: string   // "YYYY-MM"
  invoice_date: string
  items: InvoiceItem[]
  subtotal: number
  gst_amount: number
  total: number
  /** Currency the invoice is billed in — replaces the old EUR hardcode.
   *  Defaults to 'EUR' when not provided so old callers still work. */
  currency?: string
  /** Optional Bill From block. When missing we fall back to a generic
   *  "Your Company" placeholder so nothing crashes for old callers. */
  bill_from?: {
    name: string
    /** Public URL to the company logo (companies.logo_path resolved via
     *  vaultr-avatars public bucket). Rendered top-left in place of the
     *  uppercase text header. */
    logo_url?: string | null
    contact?: string
    email?: string
    phone?: string
    address?: string
    bank_account_name?: string
    bank_account_number?: string
    bank_ifsc?: string
    bank_name?: string
    swift_code?: string
  }
  /** Optional Bill To block. Same rules as bill_from. */
  bill_to?: {
    name: string
    contact?: string
    email?: string
    address?: string
    country?: string
  }
  /** Legacy — was used for the top-left brand title. Now optional; the PDF
   *  falls back to bill_from.name if this isn't set. */
  company_name?: string
  forex_rate?: number     // INR per <currency> used for this invoice
  /** v69 — per-company look (Feature 1b). */
  template?: string
  accent?: string
}
