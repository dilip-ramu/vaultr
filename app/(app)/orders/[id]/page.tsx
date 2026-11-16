import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import OrderSheet, {
  type OrderRow, type CostRow, type DocRow, type CustInvRow, type BillRow,
} from '@/components/orders/OrderSheet'
import type { OrderFileRow } from '@/components/orders/OrderFilesPanel'
import type { OrderPaymentRow } from '@/components/orders/OrderPayments'
import type { SummaryInput } from '@/lib/orders/summaryDoc'
import { normalizeAccent } from '@/lib/companies/templates'
import {
  packingRows, totalCartons, reconcilePacking,
  type Pack, type OrderedPiece,
} from '@/lib/orders/packing'

export const dynamic = 'force-dynamic'

/** How far back the attach picker looks. Far enough to find the paperwork for
 *  a live order, short enough not to hand you a thousand rows to scroll. */
const FREE_LIMIT = 60
/** Matches nothing. Used when an order has no customer id, so the picker comes
 *  back empty instead of offering every unattached invoice you own. */
const NO_ID = '00000000-0000-0000-0000-000000000000'

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { data: order } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', uid).maybeSingle()
  if (!order) notFound()

  const [
    { data: lines }, { data: costs },
    { data: docs }, { data: custInvoices }, { data: bills },
    { data: freeSellDocs }, { data: freeBuyDocs }, { data: freeCustInvoices }, { data: freeBills },
    { data: files }, { data: sizes }, { data: packRows },
    { data: paymentRows }, { data: accounts }, { data: suppliers }, { data: customers },
  ] = await Promise.all([
    supabase.from('order_lines').select('*').eq('order_id', id).order('line_number'),
    supabase.from('order_costs').select('*').eq('order_id', id).order('line_number'),
    supabase.from('documents').select('id, doc_type, number, date, total').eq('user_id', uid).eq('order_id', id).order('date', { ascending: false }),
    supabase.from('recoverable_invoices').select('id, invoice_number, invoice_date, total, currency, status').eq('user_id', uid).eq('order_id', id).order('invoice_date', { ascending: false }),
    supabase.from('supplier_invoices').select('id, invoice_number, invoice_date, amount, currency, is_paid').eq('user_id', uid).eq('order_id', id).order('invoice_date', { ascending: false }),
    // The attach picker: anything not already on an order. The sell side is
    // narrowed to THIS customer — offering you another customer's sales order
    // is an invitation to attach the wrong one.
    supabase.from('documents').select('id, doc_type, number, date, total').eq('user_id', uid).is('order_id', null)
      .eq('party_kind', 'customer').eq('party_id', order.customer_id ?? NO_ID)
      .order('date', { ascending: false }).limit(FREE_LIMIT),
    supabase.from('documents').select('id, doc_type, number, date, total').eq('user_id', uid).is('order_id', null)
      .eq('party_kind', 'supplier').order('date', { ascending: false }).limit(FREE_LIMIT),
    supabase.from('recoverable_invoices').select('id, invoice_number, invoice_date, total, currency, status').eq('user_id', uid).is('order_id', null)
      .eq('customer_id', order.customer_id ?? NO_ID)
      .order('invoice_date', { ascending: false }).limit(FREE_LIMIT),
    supabase.from('supplier_invoices').select('id, invoice_number, invoice_date, amount, currency, is_paid').eq('user_id', uid).is('order_id', null).order('invoice_date', { ascending: false }).limit(FREE_LIMIT),
    supabase.from('order_files').select('id, side, name, path, size').eq('order_id', id).order('created_at'),
    supabase.from('order_line_sizes').select('*').eq('order_id', id).order('sort'),
    supabase.from('order_packs').select('*').eq('order_id', id).order('sort'),
    supabase.from('order_payments').select('*').eq('order_id', id).order('paid_date', { ascending: false }),
    supabase.from('accounts').select('id, name').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('suppliers').select('id, name').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('customers').select('id, name').eq('user_id', uid).order('name'),
  ])

  // Sizes belong to their line; the quantity on screen comes from them.
  const sizesByLine = new Map<string, { label: string; qty: number; shippedQty: number }[]>()
  for (const s of sizes ?? []) {
    const k = String(s.line_id)
    const list = sizesByLine.get(k) ?? []
    list.push({ label: String(s.label ?? ''), qty: Number(s.qty) || 0, shippedQty: Number(s.shipped_qty) || 0 })
    sizesByLine.set(k, list)
  }
  const lineRows = (lines ?? []).map(l => ({
    id: String(l.id),
    item: String(l.item ?? ''),
    description: (l.description as string | null) ?? null,
    qty: Number(l.qty) || 0,
    sell_rate: Number(l.sell_rate) || 0,
    cost_rate: Number(l.cost_rate) || 0,
    shipped_qty: Number(l.shipped_qty) || 0,
    hsn: (l.hsn_sac as string | null) ?? null,
    sizes: sizesByLine.get(String(l.id)) ?? [],
  }))

  // Packing, written the way a packer reads it. The style name comes from
  // the line, so a carton mixing two styles names both.
  const packs: Pack[] = (packRows ?? []).map(p => ({
    kind: p.kind === 'solid' ? 'solid' : 'assort',
    setsPerCarton: Number(p.sets_per_carton) || 1,
    cartons: Number(p.cartons) || 0,
    contents: (Array.isArray(p.contents) ? p.contents : []).map((c: Record<string, unknown>) => ({
      lineId: String(c?.line_id ?? ''), size: String(c?.size ?? ''), qty: Number(c?.qty) || 0,
    })),
  }))
  const styleName = (lineId: string) => lineRows.find(l => l.id === lineId)?.item ?? 'Style'
  const rows = packingRows(packs, styleName)
  const cartons = totalCartons(packs)
  const tolerancePct = Number(order.overship_tolerance_pct) || 0

  // Does the packing add up? Worked out here so the order page says it
  // without anybody opening the edit form.
  const orderedPieces: OrderedPiece[] = []
  for (const l of lineRows) {
    if (l.sizes.length) for (const s of l.sizes) orderedPieces.push({ lineId: l.id, size: s.label, qty: s.qty })
    else orderedPieces.push({ lineId: l.id, size: '', qty: l.qty })
  }
  const packCheck = reconcilePacking(orderedPieces, packs, tolerancePct)
  const label = (d: { lineId: string; size: string; difference: number }) =>
    `${styleName(d.lineId)}${d.size ? ` ${d.size}` : ''} ${d.difference > 0 ? d.difference : `+${-d.difference}`}`
  const packing = {
    rows,
    cartons,
    tolerancePct,
    packed: packCheck.packedTotal,
    ordered: packCheck.orderedTotal,
    balanced: packCheck.balanced,
    short: packCheck.short.map(label),
    overWithin: packCheck.overWithinTolerance.map(label),
    overBeyond: packCheck.overBeyondTolerance.map(label),
  }

  // The purchase order already raised, if any — the supplier pack puts it in
  // the zip and names the zip after it.
  const poDoc = (docs ?? []).find(d => d.doc_type === 'purchase_order') ?? null
  let po: { id: string; number: string; supplierName: string | null; supplierId: string | null } | null = null
  if (poDoc) {
    const { data: full } = await supabase.from('documents')
      .select('party_name, party_id').eq('id', poDoc.id).maybeSingle()
    po = {
      id: String(poDoc.id), number: String(poDoc.number),
      supplierName: (full?.party_name as string | null) ?? null,
      // Carried so a bill raised from the order opens with the right supplier
      // already chosen.
      supplierId: (full?.party_id as string | null) ?? null,
    }
  }

  // Branding for the one-page summary in the supplier pack — the same
  // letterhead as every other document.
  let company: Record<string, unknown> | null = null
  if (order.company_id) {
    const { data } = await supabase.from('companies')
      .select('name, address, gstin, phone, email, invoice_accent, logo_path, document_logo_path')
      .eq('id', order.company_id).eq('user_id', uid).maybeSingle()
    company = (data as Record<string, unknown> | null) ?? null
  }
  const logoPath = (company?.document_logo_path as string | null) ?? (company?.logo_path as string | null)
  const companyLines: string[] = []
  if (company?.address) companyLines.push(String(company.address))
  const l2: string[] = []
  if (company?.gstin) l2.push('GSTIN ' + company.gstin)
  if (company?.phone) l2.push(String(company.phone))
  if (l2.length) companyLines.push(l2.join(' · '))
  if (company?.email) companyLines.push(String(company.email))

  const summary: SummaryInput = {
    orderNumber: String(order.number),
    orderDate: String(order.order_date ?? '').slice(0, 10),
    customerPoNo: (order.customer_po_no as string | null) ?? null,
    poNumber: po?.number ?? null,
    // The order holds the dates now; the purchase order is a copy of them.
    cutoffDate: (order.cutoff_date as string | null) ?? null,
    etd: (order.etd as string | null) ?? null,
    supplierName: po?.supplierName ?? null,
    companyName: (company?.name as string | null) ?? 'Company',
    companyLines,
    accent: normalizeAccent(company?.invoice_accent),
    logoUrl: logoPath ? supabase.storage.from('vaultr-avatars').getPublicUrl(logoPath).data?.publicUrl ?? null : null,
    lines: lineRows.map(l => ({
      item: l.item, description: l.description, qty: l.qty, costRate: l.cost_rate, sizes: l.sizes,
    })),
    packing: rows,
    cartons,
    tolerancePct,
    notes: (order.notes as string | null) ?? null,
  }

  // What the supplier has actually billed. The money card measures against
  // this and not against the agreed cost: until they invoice, nothing is
  // owed however much the order says it will come to.
  const billedTotal = (bills ?? []).reduce((t, b) => t + (Number(b.amount) || 0), 0)
  // In rupees, so it sits beside the supplier side. An export invoice is in
  // the customer's currency, converted at whatever rate the order holds.
  const invoiceRate = Number(order.realised_rate) || Number(order.booked_rate) || 1
  const invoicedTotal = (custInvoices ?? []).reduce((t, i) => t + (Number(i.total) || 0), 0) * invoiceRate

  // Today from the server, so the sheet and the list agree on what is late.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  return (
    <OrderSheet
      today={today}
      order={order as OrderRow}
      lines={lineRows}
      costs={(costs ?? []) as CostRow[]}
      docs={(docs ?? []) as DocRow[]}
      custInvoices={(custInvoices ?? []) as CustInvRow[]}
      bills={(bills ?? []) as BillRow[]}
      freeSellDocs={(freeSellDocs ?? []) as DocRow[]}
      freeBuyDocs={(freeBuyDocs ?? []) as DocRow[]}
      freeCustInvoices={(freeCustInvoices ?? []) as CustInvRow[]}
      freeBills={(freeBills ?? []) as BillRow[]}
      files={(files ?? []) as OrderFileRow[]}
      packing={packing}
      payments={(paymentRows ?? []) as OrderPaymentRow[]}
      accounts={(accounts ?? []) as { id: string; name: string }[]}
      suppliers={(suppliers ?? []) as { id: string; name: string }[]}
      customers={(customers ?? []) as { id: string; name: string }[]}
      billedTotal={billedTotal}
      invoicedTotal={invoicedTotal}
      pieces={packCheck.orderedTotal}
      brand={{
        partyLines: [],
        companyName: summary.companyName,
        companyLines: summary.companyLines,
        accent: summary.accent,
        logoUrl: summary.logoUrl,
        signatureLabel: `For ${summary.companyName}`,
      }}
      summary={summary}
      po={po}
    />
  )
}
