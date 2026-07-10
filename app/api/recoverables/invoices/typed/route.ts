import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextInvoiceNumber } from '@/lib/recoverables/invoices/number'

/**
 * POST /api/recoverables/invoices/typed
 *
 * Creates a "blank" typed GST tax invoice — the user types each line
 * (description, qty, rate, HSN, per-line CGST/SGST%) rather than pulling from
 * courier allocations or the reimbursables expense queue. Persists to the same
 * recoverable_invoices / recoverable_invoice_lines tables (invoice_type =
 * 'tax_invoice', item_type = 'tax_invoice_line') so it flows through the exact
 * same detail page, PDF renderer, list, payments, and delete paths.
 */

const DUE_DATE_DAYS: Record<string, number> = {
  net_7: 7, net_15: 15, net_30: 30, net_60: 60, net_90: 90,
}
function calcDueDate(invoiceDate: string, paymentTerms: string): string {
  const days = DUE_DATE_DAYS[paymentTerms]
  if (!days) return invoiceDate
  const d = new Date(invoiceDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const r2 = (n: number) => Math.round(n * 100) / 100

interface TypedLineInput {
  description: string
  qty: number
  rate: number
  hsn?: string
  cgst?: number
  sgst?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    customerId?: string
    companyId?: string | null
    invoiceDate?: string
    paymentTerms?: string
    notes?: string | null
    signatoryId?: string | null
    lines?: TypedLineInput[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    customerId, companyId,
    invoiceDate = new Date().toISOString().slice(0, 10),
    paymentTerms = 'due_on_receipt',
    notes, signatoryId, lines: rawLines,
  } = body

  if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })

  // Keep only lines with a description AND a positive amount.
  const inputLines = (rawLines ?? [])
    .map(l => ({
      description: (l.description ?? '').trim(),
      qty:  Number(l.qty ?? 0),
      rate: Number(l.rate ?? 0),
      hsn:  (l.hsn ?? '').trim(),
      cgst: Number(l.cgst ?? 0),
      sgst: Number(l.sgst ?? 0),
    }))
    .filter(l => l.description && l.qty > 0 && l.rate > 0)

  if (!inputLines.length) {
    return NextResponse.json({ error: 'Add at least one line with a description, qty and rate.' }, { status: 400 })
  }

  // ── Customer (Bill-To details) ────────────────────────────────────────────
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, address, gst_number, state')
    .eq('id', customerId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 400 })

  // ── Company (numbering counter + default GST/HSN) ─────────────────────────
  const companyQuery = companyId
    ? supabase.from('companies').select('*').eq('user_id', user.id).eq('id', companyId).maybeSingle()
    : supabase.from('companies').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: true }).limit(1).maybeSingle()
  const { data: company } = await companyQuery

  const defCgst = Number(company?.cgst_rate ?? 9)
  const defSgst = Number(company?.sgst_rate ?? 9)
  const defHsn  = (company?.hsn_sac as string | null) ?? '996812'

  // ── Invoice number (per-company counter, same as courier path) ────────────
  let invoiceNumber: string
  const resolvedCompanyId: string | null = company?.id ?? null
  if (company) {
    const current = Number(company.next_invoice_number ?? 1)
    const prefix  = String(company.invoice_prefix ?? 'INV-')
    invoiceNumber = prefix + String(current).padStart(6, '0')
    await supabase
      .from('companies')
      .update({ next_invoice_number: current + 1 })
      .eq('id', company.id).eq('user_id', user.id)
  } else {
    invoiceNumber = await getNextInvoiceNumber(supabase, user.id)
  }

  // ── Compute lines + totals ────────────────────────────────────────────────
  const lines = inputLines.map((l, i) => {
    const cgstRate = l.cgst || defCgst
    const sgstRate = l.sgst || defSgst
    const amount   = r2(l.qty * l.rate)
    return {
      line_number: i + 1,
      description: l.description,
      hsn_sac:     l.hsn || defHsn,
      qty:         Math.round(l.qty),
      rate:        l.rate,
      amount,
      cgst_rate:   cgstRate,
      cgst_amount: r2(amount * cgstRate / 100),
      sgst_rate:   sgstRate,
      sgst_amount: r2(amount * sgstRate / 100),
    }
  })

  const subtotal   = r2(lines.reduce((s, l) => s + l.amount, 0))
  const cgstAmount = r2(lines.reduce((s, l) => s + l.cgst_amount, 0))
  const sgstAmount = r2(lines.reduce((s, l) => s + l.sgst_amount, 0))
  const total      = r2(subtotal + cgstAmount + sgstAmount)

  const uniform = (get: (l: typeof lines[number]) => number, fallback: number) =>
    lines.length && lines.every(l => get(l) === get(lines[0])) ? get(lines[0]) : fallback
  const headerCgstRate = uniform(l => l.cgst_rate, defCgst)
  const headerSgstRate = uniform(l => l.sgst_rate, defSgst)

  // ── Insert invoice header ─────────────────────────────────────────────────
  const { data: invoiceRow, error: invErr } = await supabase
    .from('recoverable_invoices')
    .insert({
      user_id:          user.id,
      company_id:       resolvedCompanyId,
      invoice_number:   invoiceNumber,
      invoice_type:     'tax_invoice',
      customer_name:    customer.name,
      customer_id:      customer.id,
      customer_address: (customer as { address: string | null }).address,
      customer_gstin:   (customer as { gst_number: string | null }).gst_number,
      customer_state:   (customer as { state: string | null }).state,
      invoice_date:     invoiceDate,
      due_date:         calcDueDate(invoiceDate, paymentTerms),
      payment_terms:    paymentTerms,
      markup_type:      'none',
      markup_value:     0,
      subtotal,
      cgst_rate:        headerCgstRate,
      sgst_rate:        headerSgstRate,
      cgst_amount:      cgstAmount,
      sgst_amount:      sgstAmount,
      total,
      paid_amount:      0,
      balance_due:      total,
      status:           'draft',
      notes:            notes ?? null,
      signatory_id:     signatoryId ?? null,
      currency:         'INR',
      design_version:   'claude',
    })
    .select('id')
    .single()

  if (invErr || !invoiceRow) {
    return NextResponse.json({ error: invErr?.message ?? 'Failed to create invoice' }, { status: 500 })
  }
  const invoiceId = invoiceRow.id as string

  // ── Insert lines ──────────────────────────────────────────────────────────
  const lineRows = lines.map(l => ({
    user_id:     user.id,
    invoice_id:  invoiceId,
    line_number: l.line_number,
    item_type:   'tax_invoice_line',
    description: l.description,
    awb:         l.description,   // awb is NOT NULL; reuse the description as the label
    hsn_sac:     l.hsn_sac,
    qty:         l.qty,
    base_rate:   l.rate,
    rate:        l.rate,
    amount:      l.amount,
    cgst_rate:   l.cgst_rate,
    cgst_amount: l.cgst_amount,
    sgst_rate:   l.sgst_rate,
    sgst_amount: l.sgst_amount,
  }))

  const { error: lineErr } = await supabase.from('recoverable_invoice_lines').insert(lineRows)
  if (lineErr) {
    // Roll back the header so we don't leave an orphan invoice.
    await supabase.from('recoverable_invoices').delete().eq('id', invoiceId).eq('user_id', user.id)
    return NextResponse.json({ error: `Line insert failed: ${lineErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ id: invoiceId, invoice_number: invoiceNumber })
}
