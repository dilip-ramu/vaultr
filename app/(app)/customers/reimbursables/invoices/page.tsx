import { createClient } from '@/lib/supabase/server'
import ReimbursableHistoryClient from '@/components/reimbursables/ReimbursableHistoryClient'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

/**
 * Reimbursables → Invoices tab.
 *
 * Batch E · Deploy 4: reads have flipped from contrast_invoices to
 * recoverable_invoices (WHERE invoice_type = 'reimbursement'). Writes still
 * go through /api/contrast/invoices — the Deploy 2 trigger mirrors them into
 * the unified table so subsequent reads see the update.
 *
 * The response is reshaped in-page to the historical `contrast_invoices`
 * shape so ReimbursableHistoryClient doesn't have to change. Field mapping:
 *   recoverable_invoices.cgst_amount + sgst_amount → gst_amount
 *   recoverable_invoices.sent_at                   → finalized_at
 *   recoverable_invoice_lines.amount               → amount_inr
 *   recoverable_invoice_lines.description          → description (v60a)
 *   recoverable_invoice_lines.sort_order n/a       → line_number
 *
 * Rollback: swap the .from() back to 'contrast_invoices' + drop the mapping.
 */
export default async function ReimbursableInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { customer: customerParam } = await searchParams
  const reimbursables = await getReimbursableCustomers(supabase, uid)
  const active = resolveActiveCustomer(reimbursables, customerParam ?? null)

  let query = supabase
    .from('recoverable_invoices')
    .select(`
      id, invoice_number, invoice_month, invoice_date, status,
      subtotal, cgst_amount, sgst_amount, total,
      notes, sent_at, created_at, customer_id,
      items:recoverable_invoice_lines(
        id, item_type, description, salary_amount, expended_rate,
        amount, line_number
      )
    `)
    .eq('user_id', uid)
    .eq('invoice_type', 'reimbursement')
    .order('invoice_month', { ascending: false })
  if (active) query = query.eq('customer_id', active.id)

  const { data: raw } = await query

  // v65: fetch every payroll month linked to a reimbursement invoice so
  // the "Process payroll" CTA can appear once the cascade unlocks the month.
  const { data: payrollMonths } = await supabase
    .from('payroll_months')
    .select('id, contrast_invoice_id, status, payroll_month')
    .eq('user_id', uid)
    .not('contrast_invoice_id', 'is', null)
  type PMRow = { id: string; contrast_invoice_id: string; status: string; payroll_month: string }
  const payrollByInvoice: Record<string, { id: string; status: string; payroll_month: string }> = {}
  for (const pm of ((payrollMonths ?? []) as PMRow[])) {
    payrollByInvoice[pm.contrast_invoice_id] = {
      id: pm.id, status: pm.status, payroll_month: pm.payroll_month,
    }
  }

  // Shape-adapter: map recoverable_invoices columns back to the historical
  // contrast_invoices/items field names the client expects.
  type RawLine = {
    id: string
    item_type: string | null
    description: string | null
    salary_amount: number | null
    expended_rate: number | null
    amount: number
    line_number: number
  }
  type RawInvoice = {
    id: string
    invoice_number: string
    invoice_month: string | null
    invoice_date: string
    status: string
    subtotal: number
    cgst_amount: number
    sgst_amount: number
    total: number
    notes: string | null
    sent_at: string | null
    created_at: string
    customer_id: string | null
    items: RawLine[]
  }

  const invoices = ((raw ?? []) as RawInvoice[]).map(inv => ({
    id:             inv.id,
    invoice_number: inv.invoice_number,
    invoice_month:  inv.invoice_month ?? '',
    invoice_date:   inv.invoice_date,
    status:         inv.status,
    subtotal:       Number(inv.subtotal ?? 0),
    gst_amount:     Number(inv.cgst_amount ?? 0) + Number(inv.sgst_amount ?? 0),
    total:          Number(inv.total ?? 0),
    notes:          inv.notes,
    finalized_at:   inv.sent_at,
    created_at:     inv.created_at,
    customer_id:    inv.customer_id,
    payroll:        payrollByInvoice[inv.id] ?? null,
    items: (inv.items ?? [])
      .slice()
      .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
      .map(it => ({
        id:            it.id,
        item_type:     it.item_type,
        description:   it.description ?? '',
        salary_amount: it.salary_amount,
        expended_rate: it.expended_rate,
        amount_inr:    Number(it.amount ?? 0),
        sort_order:    it.line_number,
      })),
  }))

  return <ReimbursableHistoryClient invoices={invoices as never[]} />
}
