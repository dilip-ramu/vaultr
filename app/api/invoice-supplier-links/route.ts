import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET /api/invoice-supplier-links ──────────────────────────────────────────
// Query params (one required):
//   ?recoverable_invoice_id=X  → links for a customer invoice, joined with supplier invoice details
//   ?supplier_invoice_id=X     → links for a supplier invoice, joined with customer invoice details

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const recoverableInvoiceId = searchParams.get('recoverable_invoice_id')
  const supplierInvoiceId    = searchParams.get('supplier_invoice_id')

  if (!recoverableInvoiceId && !supplierInvoiceId) {
    return NextResponse.json({ error: 'Provide recoverable_invoice_id or supplier_invoice_id' }, { status: 400 })
  }

  if (recoverableInvoiceId) {
    // Return links for a customer invoice, with full supplier invoice + supplier details
    const { data, error } = await supabase
      .from('invoice_supplier_links')
      .select(`
        id, allocated_amount, notes, created_at,
        supplier_invoice:supplier_invoices(
          id, invoice_number, invoice_date, due_date, amount, currency,
          is_paid, payment_date, status, recoverable_status,
          category, notes,
          supplier:suppliers(id, name, supplier_code)
        )
      `)
      .eq('recoverable_invoice_id', recoverableInvoiceId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ links: data ?? [] })
  }

  // Return links for a supplier invoice, with full customer invoice details
  const { data, error } = await supabase
    .from('invoice_supplier_links')
    .select(`
      id, allocated_amount, notes, created_at,
      recoverable_invoice:recoverable_invoices(
        id, invoice_number, customer_name, customer_id,
        invoice_date, due_date, total, subtotal, status,
        paid_amount, balance_due, paid_at
      )
    `)
    .eq('supplier_invoice_id', supplierInvoiceId!)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data ?? [] })
}

// ── POST /api/invoice-supplier-links ─────────────────────────────────────────
// Body: { recoverable_invoice_id, supplier_invoice_id, allocated_amount? }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    recoverable_invoice_id: string
    supplier_invoice_id: string
    allocated_amount?: number | null
    notes?: string | null
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { recoverable_invoice_id, supplier_invoice_id, allocated_amount, notes } = body

  if (!recoverable_invoice_id || !supplier_invoice_id) {
    return NextResponse.json({ error: 'recoverable_invoice_id and supplier_invoice_id are required' }, { status: 400 })
  }

  // Verify both invoices belong to this user
  const [{ data: ri }, { data: si }] = await Promise.all([
    // Batch E: this API links suppliers to TAX invoices only, never reimbursements.
    supabase.from('recoverable_invoices').select('id').eq('id', recoverable_invoice_id).eq('user_id', user.id).eq('invoice_type', 'tax_invoice').single(),
    supabase.from('supplier_invoices').select('id').eq('id', supplier_invoice_id).eq('user_id', user.id).single(),
  ])

  if (!ri) return NextResponse.json({ error: 'Customer invoice not found' }, { status: 404 })
  if (!si) return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('invoice_supplier_links')
    .upsert({
      user_id: user.id,
      recoverable_invoice_id,
      supplier_invoice_id,
      allocated_amount: allocated_amount ?? null,
      notes: notes ?? null,
    }, { onConflict: 'recoverable_invoice_id,supplier_invoice_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data }, { status: 201 })
}
