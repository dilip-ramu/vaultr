import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Reimbursement invoices — REST endpoints.
 *
 * Batch E · Deploy 5: writes flipped from contrast_invoices to
 * recoverable_invoices (invoice_type='reimbursement'). API URL and request
 * shapes are unchanged so the client (ReimbursableInvoiceClient +
 * ReimbursableHistoryClient) doesn't need to be touched. Response shape is
 * adapted back to the historical fields the client expects.
 *
 * The Deploy 2 mirror trigger stays enabled as a safety net — since this
 * route no longer writes to contrast_invoices, the trigger simply doesn't
 * fire. It'll be dropped in Deploy 6.
 */

// GET  – list reimbursement invoices. Optional ?customer=<id> filter.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const customerId = new URL(req.url).searchParams.get('customer')

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
    .eq('user_id', user.id)
    .eq('invoice_type', 'reimbursement')
    .order('invoice_month', { ascending: false })

  if (customerId) query = query.eq('customer_id', customerId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Adapt to the historical shape the client expects.
  const adapted = (data ?? []).map(inv => ({
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
    items: (inv.items ?? [])
      .slice()
      .sort((a: { line_number: number }, b: { line_number: number }) =>
        (a.line_number ?? 0) - (b.line_number ?? 0))
      .map((it: {
        id: string; item_type: string | null; description: string | null;
        salary_amount: number | null; expended_rate: number | null;
        amount: number; line_number: number;
      }) => ({
        id:            it.id,
        item_type:     it.item_type,
        description:   it.description ?? '',
        salary_amount: it.salary_amount,
        expended_rate: it.expended_rate,
        amount_inr:    Number(it.amount ?? 0),
        sort_order:    it.line_number,
      })),
  }))

  return NextResponse.json(adapted)
}

// POST – create (draft) invoice for a month, tagged to a customer.
// Body: { invoice_month: "YYYY-MM", customer_id?: UUID }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { invoice_month, customer_id, company_id, invoice_date } = await req.json() as {
    invoice_month: string; customer_id?: string; company_id?: string; invoice_date?: string
  }
  if (!invoice_month) return NextResponse.json({ error: 'invoice_month required' }, { status: 400 })

  // Reuse the atomic PI-YYYYMM-NNN sequence — this RPC is shared across old
  // and new tables (it just counts). Same numbering scheme = no observable
  // change in invoice numbers before/after Batch E.
  let invoice_number: string
  const { data: claimed, error: rpcError } = await supabase
    .rpc('claim_contrast_invoice_number', { p_month: invoice_month })
  if (!rpcError && typeof claimed === 'string' && claimed.length > 0) {
    invoice_number = claimed
  } else {
    // Fallback (RPC missing): count reimbursement rows in the unified table.
    // Deploy 6 dropped contrast_invoices, so it's a single-table count.
    const { count } = await supabase
      .from('recoverable_invoices').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('invoice_type', 'reimbursement')
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    invoice_number = `PI-${invoice_month.replace('-', '')}-${seq}`
  }

  // Look up customer for the required fields on recoverable_invoices.
  // customer_name is NOT NULL; fall back to 'Contrast' if no customer resolved.
  let customer_name = 'Contrast'
  let customer_address: string | null = null
  let customer_gstin:   string | null = null
  let customer_state:   string | null = null
  let currency = 'EUR'
  if (customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('name, address, gst_number, state, billing_currency')
      .eq('id', customer_id).eq('user_id', user.id).maybeSingle()
    if (c) {
      customer_name    = c.name
      customer_address = c.address
      customer_gstin   = c.gst_number
      customer_state   = c.state
      currency         = c.billing_currency ?? 'EUR'
    }
  }

  const { data: created, error } = await supabase
    .from('recoverable_invoices')
    .insert({
      user_id: user.id,
      invoice_type: 'reimbursement',
      invoice_number,
      invoice_month,
      // v67: use the client-provided date when set; falls back to today.
      // Drives the finalize step's payroll month via invoice_month too.
      invoice_date: invoice_date ?? new Date().toISOString().slice(0, 10),
      status: 'draft',
      // company_id: which of the user's companies this invoice is billed
      // FROM. Falls back to null when the client doesn't send one (older
      // callers) — the PDF then reads from the default company anyway.
      company_id: company_id ?? null,
      customer_id: customer_id ?? null,
      customer_name,
      customer_address,
      customer_gstin,
      customer_state,
      // Empty-shell totals — filled by /finalize after the user picks items.
      subtotal: 0, cgst_amount: 0, sgst_amount: 0, total: 0,
      paid_amount: 0, balance_due: 0,
      markup_type: 'none', markup_value: 0,
      payment_terms: 'due_on_receipt',
      currency,
      design_version: 'claude',
    })
    .select(`
      id, invoice_number, invoice_month, invoice_date, status,
      subtotal, cgst_amount, sgst_amount, total,
      notes, sent_at, created_at, customer_id
    `)
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Adapt the single-row response to the client's expected shape.
  return NextResponse.json({
    id:             created.id,
    invoice_number: created.invoice_number,
    invoice_month:  created.invoice_month ?? '',
    invoice_date:   created.invoice_date,
    status:         created.status,
    subtotal:       Number(created.subtotal ?? 0),
    gst_amount:     Number(created.cgst_amount ?? 0) + Number(created.sgst_amount ?? 0),
    total:          Number(created.total ?? 0),
    notes:          created.notes,
    finalized_at:   created.sent_at,
    created_at:     created.created_at,
    customer_id:    created.customer_id,
  }, { status: 201 })
}
