// Turn Vaultr's tables into the neutral shapes lib/gst/returns.ts works on.
//
// Every outward document in the app records tax as CGST + SGST. There is no
// IGST column anywhere — an inter-state supply is recorded with zero CGST/SGST
// and the tax folded into the total (the same rule the PDF adapters use). So
// IGST is INFERRED here, in exactly one place, rather than half-guessed in five.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GstCompany, OutwardSupply, InwardSupply, SupplyLine } from './returns'
import { stateCodeFromGstin, stateCodeFromName } from './states'

const n = (v: unknown) => Number(v) || 0

/** Split a document's tax into the three heads. */
function heads(subtotal: number, cgst: number, sgst: number, total: number) {
  if (cgst > 0 || sgst > 0) return { cgst, sgst, igst: 0 }
  const inferred = Math.max(0, Math.round((total - subtotal) * 100) / 100)
  return { cgst: 0, sgst: 0, igst: inferred }
}

/** The rate implied by a taxable value and the tax charged on it. */
const rateOf = (taxable: number, tax: number) =>
  taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0

export function toGstCompany(c: Record<string, unknown>): GstCompany {
  const gstin = (c.gstin as string | null) ?? null
  return {
    id: c.id as string,
    name: c.name as string,
    gstin,
    stateCode: stateCodeFromGstin(gstin) ?? stateCodeFromName((c.address as string | null) ?? null),
  }
}

/** Everything sold in the period, from all three outward sources. */
export async function collectOutward(
  supabase: SupabaseClient, userId: string, companyId: string, month: string,
): Promise<OutwardSupply[]> {
  const from = `${month}-01`
  const to = `${month}-31`
  const supplies: OutwardSupply[] = []

  // 1. Tax invoices.
  const { data: invoices } = await supabase
    .from('recoverable_invoices')
    .select('id, invoice_number, invoice_date, customer_name, customer_gstin, customer_state, subtotal, cgst_amount, sgst_amount, total, status')
    .eq('user_id', userId).eq('company_id', companyId)
    .gte('invoice_date', from).lte('invoice_date', to)

  const invIds = (invoices ?? []).map(i => i.id as string)
  const { data: invLines } = invIds.length
    ? await supabase.from('recoverable_invoice_lines')
        .select('invoice_id, hsn_sac, qty, amount, cgst_amount, sgst_amount')
        .in('invoice_id', invIds)
    : { data: [] as Record<string, unknown>[] }

  for (const i of (invoices ?? []) as Record<string, unknown>[]) {
    const subtotal = n(i.subtotal), total = n(i.total)
    const h = heads(subtotal, n(i.cgst_amount), n(i.sgst_amount), total)
    const mine = (invLines ?? []).filter(l => l.invoice_id === i.id) as Record<string, unknown>[]
    const lines: SupplyLine[] = mine.map(l => {
      const taxable = n(l.amount)
      const lc = n(l.cgst_amount), ls = n(l.sgst_amount)
      // Line-level IGST is apportioned from the document's inferred IGST.
      const li = h.igst > 0 && subtotal > 0 ? Math.round((h.igst * taxable / subtotal) * 100) / 100 : 0
      return {
        hsn: (l.hsn_sac as string | null) ?? null,
        description: 'Courier & freight services',
        qty: n(l.qty), taxable, rate: rateOf(taxable, lc + ls + li),
        cgst: lc, sgst: ls, igst: li,
      }
    })
    supplies.push({
      id: i.id as string, kind: 'invoice',
      number: String(i.invoice_number ?? ''), date: String(i.invoice_date ?? ''),
      partyName: String(i.customer_name ?? ''),
      partyGstin: (i.customer_gstin as string | null) ?? null,
      partyState: (i.customer_state as string | null) ?? null,
      taxable: subtotal, ...h, total, lines,
    })
  }

  // 2. Credit / debit notes raised on customers.
  const { data: notes } = await supabase
    .from('documents')
    .select('id, doc_type, number, date, reference, party_name, party_gstin, party_state, subtotal, cgst_amount, sgst_amount, total')
    .eq('user_id', userId).eq('company_id', companyId).eq('party_kind', 'customer')
    .in('doc_type', ['credit_note', 'debit_note'])
    .gte('date', from).lte('date', to)

  const noteIds = (notes ?? []).map(d => d.id as string)
  const { data: noteLines } = noteIds.length
    ? await supabase.from('document_lines')
        .select('document_id, item, hsn_sac, qty, amount, gst_rate, cgst_amount, sgst_amount')
        .in('document_id', noteIds)
    : { data: [] as Record<string, unknown>[] }

  for (const d of (notes ?? []) as Record<string, unknown>[]) {
    const subtotal = n(d.subtotal), total = n(d.total)
    const h = heads(subtotal, n(d.cgst_amount), n(d.sgst_amount), total)
    const mine = (noteLines ?? []).filter(l => l.document_id === d.id) as Record<string, unknown>[]
    const lines: SupplyLine[] = mine.map(l => {
      const taxable = n(l.amount)
      const lc = n(l.cgst_amount), ls = n(l.sgst_amount)
      const li = h.igst > 0 && subtotal > 0 ? Math.round((h.igst * taxable / subtotal) * 100) / 100 : 0
      return {
        hsn: (l.hsn_sac as string | null) ?? null,
        description: String(l.item ?? ''),
        qty: n(l.qty), taxable,
        rate: n(l.gst_rate) || rateOf(taxable, lc + ls + li),
        cgst: lc, sgst: ls, igst: li,
      }
    })
    supplies.push({
      id: d.id as string,
      kind: d.doc_type === 'credit_note' ? 'credit_note' : 'debit_note',
      number: String(d.number ?? ''), date: String(d.date ?? ''),
      partyName: String(d.party_name ?? ''),
      partyGstin: (d.party_gstin as string | null) ?? null,
      partyState: (d.party_state as string | null) ?? null,
      taxable: subtotal, ...h, total, lines,
      // The note records the invoice it adjusts in its reference field.
      againstNumber: (d.reference as string | null) ?? null,
      againstDate: null,
    })
  }

  // 3. Courier / reimbursable invoices (finalised only — a draft isn't a supply).
  const { data: courier } = await supabase
    .from('contrast_invoices')
    .select('id, invoice_number, invoice_date, status, subtotal, cgst_amount, sgst_amount, total, customer_id')
    .eq('user_id', userId).eq('company_id', companyId)
    .gte('invoice_date', from).lte('invoice_date', to)

  const custIds = [...new Set((courier ?? []).map(c => c.customer_id).filter(Boolean))] as string[]
  const { data: custs } = custIds.length
    ? await supabase.from('customers').select('id, name, gst_number, state').in('id', custIds)
    : { data: [] as Record<string, unknown>[] }

  for (const c of (courier ?? []) as Record<string, unknown>[]) {
    if (String(c.status ?? '') === 'draft') continue
    const subtotal = n(c.subtotal), total = n(c.total)
    const h = heads(subtotal, n(c.cgst_amount), n(c.sgst_amount), total)
    const cust = (custs ?? []).find(x => x.id === c.customer_id) as Record<string, unknown> | undefined
    supplies.push({
      id: c.id as string, kind: 'invoice',
      number: String(c.invoice_number ?? ''), date: String(c.invoice_date ?? ''),
      partyName: String(cust?.name ?? 'Customer'),
      partyGstin: (cust?.gst_number as string | null) ?? null,
      partyState: (cust?.state as string | null) ?? null,
      taxable: subtotal, ...h, total,
      lines: [{
        hsn: '996812', description: 'Courier & reimbursable charges',
        qty: 1, taxable: subtotal, rate: rateOf(subtotal, h.cgst + h.sgst + h.igst),
        cgst: h.cgst, sgst: h.sgst, igst: h.igst,
      }],
    })
  }

  return supplies.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
}

/** Purchases in the period, for input tax credit. */
export async function collectInward(
  supabase: SupabaseClient, userId: string, companyId: string, month: string,
): Promise<InwardSupply[]> {
  const { data } = await supabase
    .from('supplier_invoices')
    .select('id, invoice_number, invoice_date, amount, taxable_value, igst_amount, cgst_amount, sgst_amount, supplier_gstin, itc_eligible, reverse_charge, supplier:suppliers(name, gst_number)')
    .eq('user_id', userId).eq('company_id', companyId)
    .gte('invoice_date', `${month}-01`).lte('invoice_date', `${month}-31`)

  return ((data ?? []) as Record<string, unknown>[]).map(b => {
    const sup = b.supplier as { name?: string; gst_number?: string | null } | null
    return {
      id: b.id as string,
      supplierName: String(sup?.name ?? 'Supplier'),
      supplierGstin: (b.supplier_gstin as string | null) ?? sup?.gst_number ?? null,
      number: String(b.invoice_number ?? ''),
      date: String(b.invoice_date ?? ''),
      // No breakup entered → no credit claimed. Never guessed from `amount`:
      // claiming ITC that wasn't charged is a compliance problem, not a feature.
      taxable: n(b.taxable_value),
      cgst: n(b.cgst_amount), sgst: n(b.sgst_amount), igst: n(b.igst_amount),
      itcEligible: b.itc_eligible !== false,
      reverseCharge: b.reverse_charge === true,
    }
  }).sort((a, b) => a.date.localeCompare(b.date))
}
