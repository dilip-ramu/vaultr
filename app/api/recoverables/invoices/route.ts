import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextInvoiceNumber } from '@/lib/recoverables/invoices/number'
import { buildInvoiceLines, calcTotals } from '@/lib/recoverables/invoices/calculator'
import type { RecoverableAllocation, RecoverableShipment } from '@/lib/recoverables/types'

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

// ── GET /api/recoverables/invoices ────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoices, error } = await supabase
    .from('recoverable_invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices: invoices ?? [] })
}

// ── POST /api/recoverables/invoices ───────────────────────────────────────

interface CreateInvoiceBody {
  customerName: string
  customerId?: string
  companyId?: string                   // which of your own companies issued this
  markupType: 'percentage' | 'flat' | 'none'
  markupValue: number
  allocationIds: string[]
  invoiceDate: string
  paymentTerms: string
  notes?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: CreateInvoiceBody
  try {
    body = await req.json() as CreateInvoiceBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    customerName, customerId, companyId, markupType, markupValue,
    allocationIds, invoiceDate, paymentTerms, notes,
  } = body

  if (!customerName?.trim())    return NextResponse.json({ error: 'customerName is required' }, { status: 400 })
  if (!allocationIds?.length)   return NextResponse.json({ error: 'allocationIds must be non-empty' }, { status: 400 })

  // 1. Fetch allocations (scoped to this user)
  const { data: allocations, error: allocErr } = await supabase
    .from('recoverable_allocations')
    .select('*')
    .eq('user_id', user.id)
    .in('id', allocationIds)

  if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 })
  if (!allocations?.length) return NextResponse.json({ error: 'No matching allocations found' }, { status: 400 })

  // 2. Fetch shipments + chosen-or-default company in parallel.
  // Multi-company: each company carries its own GST rates / HSN / prefix /
  // numbering counter. If companyId isn't passed, fall back to the user's
  // default company; if none, fall through to the legacy settings row.
  const shipmentIds = [...new Set((allocations as RecoverableAllocation[]).map(a => a.shipment_id))]

  const companyQuery = companyId
    ? supabase.from('companies').select('*').eq('user_id', user.id).eq('id', companyId).maybeSingle()
    : supabase.from('companies').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at', { ascending: true }).limit(1).maybeSingle()

  const [{ data: shipments }, { data: company }, { data: settingsRow }] = await Promise.all([
    supabase.from('recoverable_shipments').select('*').in('id', shipmentIds),
    companyQuery,
    supabase.from('recoverable_invoice_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  let customerAddress: string | null = null
  let customerGstin:   string | null = null
  let customerState:   string | null = null

  if (customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('address, gst_number, state')
      .eq('id', customerId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (cust) {
      customerAddress = (cust as { address: string | null }).address
      customerGstin   = (cust as { gst_number: string | null }).gst_number
      customerState   = (cust as { state: string | null }).state
    }
  }

  // Prefer the chosen company's settings; fall back to legacy single-row.
  const cgstRate = Number(company?.cgst_rate ?? settingsRow?.cgst_rate ?? 9)
  const sgstRate = Number(company?.sgst_rate ?? settingsRow?.sgst_rate ?? 9)
  const hsnSac   = (company?.hsn_sac as string | null) ?? (settingsRow?.hsn_sac as string | null) ?? '996812'

  // 3. Build invoice number + due date.
  // Per-company numbering: claim the next number atomically from the chosen
  // company's counter. (Race-safe for single-user accounts; concurrent writes
  // would need an RPC, which we can add later if needed.)
  let invoiceNumber: string
  let resolvedCompanyId: string | null = company?.id ?? null
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
  const dueDate = calcDueDate(invoiceDate, paymentTerms)

  // 4. Build lines + totals
  const lines  = buildInvoiceLines(
    allocations as RecoverableAllocation[],
    (shipments ?? []) as RecoverableShipment[],
    markupType, markupValue,
    cgstRate, sgstRate,
  )
  const totals = calcTotals(lines, cgstRate, sgstRate)

  // 5. Insert invoice (draft)
  const { data: invoiceRow, error: invErr } = await supabase
    .from('recoverable_invoices')
    .insert({
      user_id:          user.id,
      company_id:       resolvedCompanyId,
      invoice_number:   invoiceNumber,
      customer_name:    customerName.trim(),
      customer_id:      customerId ?? null,
      customer_address: customerAddress,
      customer_gstin:   customerGstin,
      customer_state:   customerState,
      invoice_date:     invoiceDate,
      due_date:         dueDate,
      payment_terms:    paymentTerms,
      markup_type:      markupType,
      markup_value:     markupValue,
      subtotal:         totals.subtotal,
      cgst_rate:        cgstRate,
      sgst_rate:        sgstRate,
      cgst_amount:      totals.cgstAmount,
      sgst_amount:      totals.sgstAmount,
      total:            totals.total,
      paid_amount:      0,
      balance_due:      totals.total,
      status:           'draft',
      notes:            notes ?? null,
      currency:         'INR',
    })
    .select('id')
    .single()

  if (invErr || !invoiceRow) {
    return NextResponse.json({ error: invErr?.message ?? 'Failed to create invoice' }, { status: 500 })
  }

  const invoiceId = invoiceRow.id as string

  // 6. Insert lines in chunks of 100
  const lineRows = totals.lines.map((l, i) => ({
    user_id:       user.id,
    invoice_id:    invoiceId,
    allocation_id: l.allocationId,
    line_number:   i + 1,
    awb:           l.awb,
    shipment_date: l.shipmentDate ?? null,
    client_name:   l.clientName ?? null,
    hsn_sac:       hsnSac,
    qty:           l.qty,
    base_rate:     l.baseRate,
    rate:          l.rate,
    amount:        l.amount,
    cgst_rate:     l.cgstRate,
    cgst_amount:   l.cgstAmount,
    sgst_rate:     l.sgstRate,
    sgst_amount:   l.sgstAmount,
  }))

  for (let i = 0; i < lineRows.length; i += 100) {
    const { error: lineErr } = await supabase
      .from('recoverable_invoice_lines')
      .insert(lineRows.slice(i, i + 100))

    if (lineErr) {
      return NextResponse.json({ error: `Line insert failed: ${lineErr.message}` }, { status: 500 })
    }
  }

  // 7. Mark allocations as billed
  await supabase
    .from('recoverable_allocations')
    .update({ status: 'billed', billed_at: new Date().toISOString() })
    .in('id', allocationIds)

  // 8. Mark invoice as sent (invoices are immediately sent)
  await supabase
    .from('recoverable_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoiceId)

  // 9. Auto-link supplier invoices from shipment refs (best-effort, non-blocking)
  try {
    const shipmentIds = [...new Set((allocations as RecoverableAllocation[]).map(a => a.shipment_id))]
    const { data: shipmentRows } = await supabase
      .from('recoverable_shipments')
      .select('supplier_invoice_refs')
      .in('id', shipmentIds)
      .not('supplier_invoice_refs', 'is', null)

    if (shipmentRows?.length) {
      // Collect all unique invoice number refs across all shipments
      const allRefs = new Set<string>()
      for (const s of shipmentRows) {
        const refs = (s as { supplier_invoice_refs: string }).supplier_invoice_refs
        refs.split(/[,;]+/).map(r => r.trim()).filter(Boolean).forEach(r => allRefs.add(r))
      }

      if (allRefs.size > 0) {
        // Resolve invoice numbers to IDs
        const { data: matchedInvoices } = await supabase
          .from('supplier_invoices')
          .select('id, invoice_number')
          .eq('user_id', user.id)
          .in('invoice_number', [...allRefs])

        if (matchedInvoices?.length) {
          // Create links (ignore conflicts — upsert by unique constraint)
          await supabase
            .from('invoice_supplier_links')
            .upsert(
              matchedInvoices.map(si => ({
                user_id: user.id,
                recoverable_invoice_id: invoiceId,
                supplier_invoice_id: si.id,
              })),
              { onConflict: 'recoverable_invoice_id,supplier_invoice_id', ignoreDuplicates: true }
            )
        }
      }
    }
  } catch {
    // Auto-linking is best-effort; don't fail the invoice creation
  }

  return NextResponse.json({ success: true, invoiceId, invoiceNumber })
}
