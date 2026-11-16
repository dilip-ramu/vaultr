// A plain invoice: one step, because there is nothing to gather first.
//
// It still goes through the flow shell so the page says what it is and Back
// returns to the three choices — the commonest mistake at the chooser is
// picking the wrong kind, and the commonest reaction is to press Back.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TypedInvoiceClient from '@/components/customers/invoices/TypedInvoiceClient'
import FlowShell from '@/components/customers/invoices/FlowShell'
import { defaultGstFor } from '@/lib/documents/money'
import { billableLines } from '@/lib/orders/invoiceAllocation'

export const dynamic = 'force-dynamic'

/** An invoice line as the form takes it, carrying the order it bills. */
interface OrderDraftLine {
  description: string; hsn: string; qty: string; rate: string; cgst: string; sgst: string
  orderId: string | null
  orderLineId: string | null
}

/**
 * The lines of one order, ready to drop onto an invoice.
 *
 * Prefilled from what has SHIPPED less what is already invoiced, so a part
 * shipment invoices itself and the next invoice picks up the rest. Each line
 * carries its order, which is what lets one invoice cover two POs.
 */
async function orderBillableLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  orderId: string,
  half: string,
  defaultHsn: string,
): Promise<OrderDraftLine[]> {
  const [{ data: ol }, { data: sizes }, { data: invLines }] = await Promise.all([
    supabase.from('order_lines').select('id, item, qty, sell_rate, shipped_qty, hsn_sac').eq('order_id', orderId).order('line_number'),
    supabase.from('order_line_sizes').select('line_id, qty, shipped_qty').eq('order_id', orderId),
    supabase.from('recoverable_invoice_lines').select('order_line_id, qty').eq('user_id', uid).eq('order_id', orderId),
  ])

  // A line's shipped figure comes from its sizes once they carry one.
  const shippedByLine = new Map<string, number>()
  for (const z of (sizes ?? []) as { line_id: string; shipped_qty: number }[]) {
    shippedByLine.set(String(z.line_id), (shippedByLine.get(String(z.line_id)) ?? 0) + (Number(z.shipped_qty) || 0))
  }

  const already: Record<string, number> = {}
  for (const l of (invLines ?? []) as { order_line_id: string | null; qty: number }[]) {
    if (!l.order_line_id) continue
    already[String(l.order_line_id)] = (already[String(l.order_line_id)] ?? 0) + (Number(l.qty) || 0)
  }

  const rows = ((ol ?? []) as Record<string, unknown>[]).map(l => ({
    id: String(l.id),
    item: String(l.item ?? ''),
    qty: Number(l.qty) || 0,
    shippedQty: shippedByLine.get(String(l.id)) || Number(l.shipped_qty) || 0,
    sellRate: Number(l.sell_rate) || 0,
    hsn: (l.hsn_sac as string | null) ?? null,
  }))

  return billableLines(rows, already).map(b => {
    const src = rows.find(r => r.id === b.orderLineId)
    return {
      description: b.item,
      hsn: (src?.hsn ?? '') || defaultHsn,
      qty: String(b.qty),
      rate: String(b.rate),
      cgst: half, sgst: half,
      orderId,
      orderLineId: b.orderLineId,
    }
  })
}

export default async function DirectInvoiceFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; fromOrder?: string }>
}) {
  const { customer, fromOrder } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customers }, { data: companies }] = await Promise.all([
    supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
    supabase.from('companies').select('*').eq('user_id', user.id)
      .order('is_default', { ascending: false }).order('created_at', { ascending: true }),
  ])

  // Raised from an order: the customer, the company and above all the
  // CURRENCY come from it. The customer agreed a price in their currency, so
  // that is what they are invoiced in — rupees appear only on the purchase
  // order and on the P/L.
  let orderInitial: {
    customerId: string; companyId: string; invoiceDate: string; paymentTerms: string
    notes: string; currency: string
    lines: OrderDraftLine[]
  } | undefined
  let orderCustomer: string | null = null
  if (fromOrder) {
    const [{ data: ord }, { data: ol }] = await Promise.all([
      supabase.from('orders')
        .select('customer_id, company_id, currency, customer_po_no, number')
        .eq('id', fromOrder).eq('user_id', user.id).maybeSingle(),
      supabase.from('order_lines').select('*').eq('order_id', fromOrder).order('line_number'),
    ])
    if (ord) {
      orderCustomer = (ord.customer_id as string | null) ?? null
      const currency = String(ord.currency ?? 'INR')

      // The styles, the spec, the size breakdown and the price the customer
      // agreed are all on the order. An invoice that opens blank is an
      // invitation to type them again and get one of them wrong.
      const ids = (ol ?? []).map((l: Record<string, unknown>) => String(l.id))
      const { data: sizes } = ids.length
        ? await supabase.from('order_line_sizes').select('*').in('line_id', ids).order('sort')
        : { data: [] as Record<string, unknown>[] }
      const sizesByLine = new Map<string, { label: string; qty: number }[]>()
      for (const row of (sizes ?? []) as Record<string, unknown>[]) {
        const k = String(row.line_id)
        const list = sizesByLine.get(k) ?? []
        list.push({ label: String(row.label ?? ''), qty: Number(row.qty) || 0 })
        sizesByLine.set(k, list)
      }

      // Export invoices are zero-rated, so the tax defaults to nothing
      // rather than putting 9 + 9 on a document that must not carry it. A
      // rupee invoice starts at the rate set on the company, halved into
      // CGST and SGST.
      const companyRate = (companies ?? []).find(c => c.id === (ord.company_id as string | null))
      const wholeRate = companyRate
        ? (Number(companyRate.cgst_rate) || 0) + (Number(companyRate.sgst_rate) || 0)
        : null
      const half = String(Number(defaultGstFor(currency, wholeRate)) / 2)
      const defaultHsn = (companyRate?.hsn_sac as string | null) ?? ''

      orderInitial = {
        customerId: orderCustomer ?? '',
        companyId: (ord.company_id as string | null) ?? '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        paymentTerms: 'due_on_receipt',
        notes: '',
        currency,
        // Shipped less already invoiced, each line tagged with this order.
        lines: await orderBillableLines(supabase, user.id, fromOrder, half, defaultHsn),
      }
    }
  }

  // ── A second PO on the same invoice ───────────────────────────────────────
  //
  // One invoice often covers two of a customer's POs. The other open orders
  // for the same customer come with their billable lines ready, so adding
  // them is one click rather than retyping an order.
  const forCustomer = orderCustomer ?? customer ?? null
  let otherOrders: { id: string; number: string; currency: string; lines: OrderDraftLine[] }[] = []
  if (forCustomer) {
    const { data: others } = await supabase.from('orders')
      .select('id, number, currency, stage')
      .eq('user_id', user.id).eq('customer_id', forCustomer)
      .not('stage', 'in', '(closed,cancelled)')
      .order('order_date', { ascending: false })
      .limit(20)
    const half = orderInitial ? orderInitial.lines[0]?.cgst ?? '0' : '0'
    for (const o of (others ?? []) as { id: string; number: string; currency: string }[]) {
      if (fromOrder && String(o.id) === fromOrder) continue
      const lines = await orderBillableLines(supabase, user.id, String(o.id), half, '')
      if (lines.length === 0) continue
      otherOrders.push({ id: String(o.id), number: String(o.number), currency: String(o.currency ?? 'INR'), lines })
    }
  }

  const query: Record<string, string> = customer ? { customer } : {}

  return (
    <FlowShell flow="direct" step="build" query={query}>
      <TypedInvoiceClient
        customers={(customers ?? []) as never}
        companies={(companies ?? []) as never}
        initialCustomerId={orderCustomer ?? customer ?? null}
        initial={orderInitial as never}
        orderId={fromOrder ?? null}
        otherOrders={otherOrders}
      />
    </FlowShell>
  )
}
