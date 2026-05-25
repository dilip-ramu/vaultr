import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupplierInvoice, SupplierInvoiceLine } from './types'
import { getNextSupplierInvoiceNumber } from './invoice-numbering'

const round2 = (n: number) => Math.round(n * 100) / 100

interface GenerateParams {
  supabase: SupabaseClient
  userId: string
  customerId: string
  allocationIds: string[]
  invoiceDate: string
  dueDate?: string
  taxRate?: number
  notes?: string
  accountId?: string
  paymentTerms?: string
  // GST fields (optional — omit for non-GST invoices)
  isIGST?: boolean
  igstRate?: number
  cgstRate?: number
  sgstRate?: number
  placeOfSupply?: string
  hsnSacCode?: string
  reverseCharge?: boolean
  gstinSupplier?: string
  gstinCustomer?: string
}

export async function generateSupplierInvoice(
  params: GenerateParams,
): Promise<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[] }> {
  const {
    supabase, userId, customerId, allocationIds,
    invoiceDate, dueDate, taxRate = 0, notes, accountId, paymentTerms,
    isIGST, igstRate = 0, cgstRate = 0, sgstRate = 0,
    placeOfSupply, hsnSacCode, reverseCharge = false, gstinSupplier, gstinCustomer,
  } = params

  const gstMode = isIGST !== undefined

  if (allocationIds.length === 0) throw new Error('At least one allocation is required')

  // Fetch allocations with AWB + customer join
  const { data: allocations, error: fetchErr } = await supabase
    .from('awb_allocations')
    .select(`
      id, user_id, customer_id, pieces, weight_kg,
      base_cost, billed_amount, override_amount,
      supplier_invoice_id, invoiced_at,
      awb:awbs(
        id, awb_number, shipment_date,
        destination_city, destination_country,
        total_pieces
      )
    `)
    .in('id', allocationIds)

  if (fetchErr) throw new Error(`Failed to fetch allocations: ${fetchErr.message}`)
  if (!allocations || allocations.length === 0) throw new Error('No allocations found')

  // Validate ownership
  const wrongOwner = allocations.find(a => a.user_id !== userId)
  if (wrongOwner) throw new Error('One or more allocations do not belong to this user')

  // Validate customer consistency
  const wrongCustomer = allocations.find(a => a.customer_id !== customerId)
  if (wrongCustomer) throw new Error('All allocations must belong to the same customer')

  // Validate not already invoiced
  const alreadyInvoiced = allocations.filter(a => a.supplier_invoice_id !== null)
  if (alreadyInvoiced.length > 0) {
    const nums = alreadyInvoiced.map(a => a.id).join(', ')
    throw new Error(`Allocations already invoiced: ${nums}`)
  }

  // Generate invoice number
  const invoiceNumber = await getNextSupplierInvoiceNumber(supabase, userId)

  // Build line items
  const lines: Omit<SupplierInvoiceLine, 'id' | 'supplier_invoice_id' | 'created_at'>[] = []
  let subtotal = 0

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i]
    const awb = alloc.awb as unknown as {
      id: string; awb_number: string; shipment_date: string | null
      destination_city: string | null; destination_country: string | null
      total_pieces: number
    }

    const effectiveAmount = alloc.override_amount ?? alloc.billed_amount ?? 0
    const destination = awb.destination_city ?? awb.destination_country ?? ''
    const description = `AWB ${awb.awb_number} — ${alloc.pieces} PCS${destination ? ` → ${destination}` : ''}`

    const unitPrice = alloc.pieces > 0 ? round2(effectiveAmount / alloc.pieces) : effectiveAmount

    lines.push({
      awb_id: awb.id,
      description,
      awb_number: awb.awb_number,
      pieces: alloc.pieces,
      weight_kg: alloc.weight_kg,
      shipment_date: awb.shipment_date,
      destination: destination || null,
      unit_price: unitPrice,
      quantity: 1,
      line_total: round2(effectiveAmount),
      sort_order: i,
    })

    subtotal += effectiveAmount
  }

  subtotal = round2(subtotal)

  let taxAmount: number
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0
  let effectiveTaxRate = taxRate

  if (gstMode) {
    if (isIGST) {
      igstAmount = round2(subtotal * igstRate / 100)
      taxAmount = igstAmount
      effectiveTaxRate = igstRate
    } else {
      cgstAmount = round2(subtotal * cgstRate / 100)
      sgstAmount = round2(subtotal * sgstRate / 100)
      taxAmount = round2(cgstAmount + sgstAmount)
      effectiveTaxRate = cgstRate + sgstRate
    }
  } else {
    taxAmount = round2(subtotal * (taxRate / 100))
  }

  const totalAmount = round2(subtotal + taxAmount)

  // INSERT supplier invoice
  const { data: invoice, error: invErr } = await supabase
    .from('supplier_invoices')
    .insert({
      user_id: userId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate ?? null,
      payment_terms: paymentTerms ?? null,
      subtotal,
      tax_rate: effectiveTaxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      paid_amount: 0,
      currency: 'INR',
      status: 'draft',
      account_id: accountId ?? null,
      notes: notes ?? null,
      is_igst: gstMode ? (isIGST ?? false) : false,
      cgst_rate: cgstRate,
      sgst_rate: sgstRate,
      igst_rate: igstRate,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      reverse_charge: reverseCharge,
      hsn_sac_code: hsnSacCode ?? null,
      place_of_supply: placeOfSupply ?? null,
      gstin_supplier: gstinSupplier ?? null,
      gstin_customer: gstinCustomer ?? null,
    })
    .select('*')
    .single()

  if (invErr || !invoice) {
    throw new Error(`Failed to create invoice: ${invErr?.message ?? 'unknown'}`)
  }

  // INSERT line items
  const lineInserts = lines.map(l => ({ ...l, supplier_invoice_id: invoice.id }))
  const { data: createdLines, error: linesErr } = await supabase
    .from('supplier_invoice_lines')
    .insert(lineInserts)
    .select('*')
    .order('sort_order')

  if (linesErr || !createdLines) {
    // Attempt cleanup
    await supabase.from('supplier_invoices').delete().eq('id', invoice.id)
    throw new Error(`Failed to create invoice lines: ${linesErr?.message ?? 'unknown'}`)
  }

  // Mark allocations as invoiced
  const { error: updateErr } = await supabase
    .from('awb_allocations')
    .update({
      supplier_invoice_id: invoice.id,
      invoiced_at: new Date().toISOString(),
    })
    .in('id', allocationIds)

  if (updateErr) {
    // Attempt cleanup
    await supabase.from('supplier_invoice_lines').delete().eq('supplier_invoice_id', invoice.id)
    await supabase.from('supplier_invoices').delete().eq('id', invoice.id)
    throw new Error(`Failed to mark allocations as invoiced: ${updateErr.message}`)
  }

  return {
    invoice: invoice as SupplierInvoice,
    lines: createdLines as SupplierInvoiceLine[],
  }
}

interface MarkPaidParams {
  supabase: SupabaseClient
  invoiceId: string
  paidAmount: number
  accountId: string
  createTransaction?: boolean
}

export async function markInvoicePaid(params: MarkPaidParams): Promise<void> {
  const { supabase, invoiceId, paidAmount, accountId, createTransaction = false } = params

  const { data: invoice, error: fetchErr } = await supabase
    .from('supplier_invoices')
    .select('id, user_id, total_amount, customer_id, invoice_number, currency')
    .eq('id', invoiceId)
    .single()

  if (fetchErr || !invoice) throw new Error('Invoice not found')

  const { error: updateErr } = await supabase
    .from('supplier_invoices')
    .update({
      status: 'paid',
      paid_amount: paidAmount,
      paid_at: new Date().toISOString(),
      account_id: accountId,
    })
    .eq('id', invoiceId)

  if (updateErr) throw new Error(`Failed to mark as paid: ${updateErr.message}`)

  if (createTransaction) {
    await supabase.from('transactions').insert({
      user_id: invoice.user_id,
      account_id: accountId,
      type: 'income',
      amount: paidAmount,
      currency: invoice.currency,
      date: new Date().toISOString().split('T')[0],
      description: `Payment received — ${invoice.invoice_number}`,
      notes: `Supplier invoice ${invoice.invoice_number}`,
    })
  }
}
