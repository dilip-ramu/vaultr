import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/recoverables/invoices/typed/[id]
// Edit every detail of a typed GST tax invoice (customer, company, date, terms,
// notes, and all line items). Keeps the invoice number and any paid amount;
// re-computes totals and replaces the lines. Only typed tax invoices are
// editable this way — courier/reimbursable invoices are left alone.

const DUE_DATE_DAYS: Record<string, number> = { net_7: 7, net_15: 15, net_30: 30, net_60: 60, net_90: 90 }
function calcDueDate(invoiceDate: string, paymentTerms: string): string {
  const days = DUE_DATE_DAYS[paymentTerms]
  if (!days) return invoiceDate
  const d = new Date(invoiceDate); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const r2 = (n: number) => Math.round(n * 100) / 100

interface TypedLineInput { description: string; qty: number; rate: number; hsn?: string; cgst?: number; sgst?: number }
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { customerId?: string; companyId?: string | null; invoiceDate?: string; paymentTerms?: string; notes?: string | null; lines?: TypedLineInput[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { customerId, companyId, invoiceDate = new Date().toISOString().slice(0, 10), paymentTerms = 'due_on_receipt', notes, lines: rawLines } = body
  if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })

  // Existing invoice — must be a typed tax invoice owned by the user.
  const { data: existing } = await supabase.from('recoverable_invoices').select('id, invoice_type, paid_amount').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (existing.invoice_type !== 'tax_invoice') return NextResponse.json({ error: 'Only typed tax invoices can be edited here.' }, { status: 400 })

  const inputLines = (rawLines ?? [])
    .map(l => ({ description: (l.description ?? '').trim(), qty: Number(l.qty ?? 0), rate: Number(l.rate ?? 0), hsn: (l.hsn ?? '').trim(), cgst: Number(l.cgst ?? 0), sgst: Number(l.sgst ?? 0) }))
    .filter(l => l.description && l.qty > 0 && l.rate > 0)
  if (!inputLines.length) return NextResponse.json({ error: 'Add at least one line with a description, qty and rate.' }, { status: 400 })

  const { data: customer } = await supabase.from('customers').select('id, name, address, gst_number, state').eq('id', customerId).eq('user_id', user.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 400 })

  const { data: company } = companyId
    ? await supabase.from('companies').select('id, cgst_rate, sgst_rate, hsn_sac').eq('user_id', user.id).eq('id', companyId).maybeSingle()
    : { data: null }
  const defCgst = Number(company?.cgst_rate ?? 9), defSgst = Number(company?.sgst_rate ?? 9)
  const defHsn = (company?.hsn_sac as string | null) ?? '996812'

  const lines = inputLines.map((l, i) => {
    const cgstRate = l.cgst || defCgst, sgstRate = l.sgst || defSgst, amount = r2(l.qty * l.rate)
    return { line_number: i + 1, description: l.description, hsn_sac: l.hsn || defHsn, qty: Math.round(l.qty), rate: l.rate, amount, cgst_rate: cgstRate, cgst_amount: r2(amount * cgstRate / 100), sgst_rate: sgstRate, sgst_amount: r2(amount * sgstRate / 100) }
  })
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0))
  const cgstAmount = r2(lines.reduce((s, l) => s + l.cgst_amount, 0))
  const sgstAmount = r2(lines.reduce((s, l) => s + l.sgst_amount, 0))
  const total = r2(subtotal + cgstAmount + sgstAmount)
  const uniform = (get: (l: typeof lines[number]) => number, fb: number) => lines.length && lines.every(l => get(l) === get(lines[0])) ? get(lines[0]) : fb
  const paid = Number(existing.paid_amount) || 0

  const { error: invErr } = await supabase.from('recoverable_invoices').update({
    company_id: companyId ?? null,
    customer_name: customer.name, customer_id: customer.id,
    customer_address: (customer as { address: string | null }).address,
    customer_gstin: (customer as { gst_number: string | null }).gst_number,
    customer_state: (customer as { state: string | null }).state,
    invoice_date: invoiceDate, due_date: calcDueDate(invoiceDate, paymentTerms), payment_terms: paymentTerms,
    subtotal, cgst_rate: uniform(l => l.cgst_rate, defCgst), sgst_rate: uniform(l => l.sgst_rate, defSgst),
    cgst_amount: cgstAmount, sgst_amount: sgstAmount, total, balance_due: r2(total - paid), notes: notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id)
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // Replace lines
  await supabase.from('recoverable_invoice_lines').delete().eq('invoice_id', id).eq('user_id', user.id)
  const lineRows = lines.map(l => ({ user_id: user.id, invoice_id: id, line_number: l.line_number, item_type: 'tax_invoice_line', description: l.description, awb: l.description, hsn_sac: l.hsn_sac, qty: l.qty, base_rate: l.rate, rate: l.rate, amount: l.amount, cgst_rate: l.cgst_rate, cgst_amount: l.cgst_amount, sgst_rate: l.sgst_rate, sgst_amount: l.sgst_amount }))
  const { error: lineErr } = await supabase.from('recoverable_invoice_lines').insert(lineRows)
  if (lineErr) return NextResponse.json({ error: `Line update failed: ${lineErr.message}` }, { status: 500 })

  return NextResponse.json({ id })
}
