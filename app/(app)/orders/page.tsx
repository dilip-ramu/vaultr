import { createClient } from '@/lib/supabase/server'
import OrdersClient, { type OrderListRow } from '@/components/orders/OrdersClient'
import { computeMargin, plannedFromLines } from '@/lib/orders/margin'
import { lineQty, lineShipped } from '@/lib/orders/sizes'
import { invoicedForOrder, type InvoiceLike } from '@/lib/orders/invoiceAllocation'
import { summariseOrders, type OrderSummaryRow } from '@/lib/orders/summary'
import { orderDateFlags } from '@/lib/orders/dates'
import type { OrderStage } from '@/lib/orders/stage'

export const dynamic = 'force-dynamic'

/** Every order, with its profit worked out the same way the sheet does it —
 *  one engine, so the list and the sheet can never disagree. */
export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: orders }, { data: lines }, { data: sizes }, { data: costs }, { data: custInv }, { data: invLines }, { data: bills }] = await Promise.all([
    supabase.from('orders').select('*').eq('user_id', uid).order('order_date', { ascending: false }),
    supabase.from('order_lines').select('id, order_id, qty, sell_rate, cost_rate, shipped_qty').eq('user_id', uid),
    supabase.from('order_line_sizes').select('line_id, qty, shipped_qty').eq('user_id', uid),
    supabase.from('order_costs').select('order_id, name, sign, basis, planned, actual').eq('user_id', uid),
    // balance_due is what is still to collect; amount on an unpaid bill is
    // what is still to pay. Both are needed for the strip at the top.
    supabase.from('recoverable_invoices').select('id, order_id, total, balance_due, status').eq('user_id', uid).not('order_id', 'is', null),
    // One invoice can cover two orders, so the money is read off the LINES.
    // See lib/orders/invoiceAllocation.ts.
    supabase.from('recoverable_invoice_lines').select('invoice_id, order_id, amount').eq('user_id', uid).not('order_id', 'is', null),
    supabase.from('supplier_invoices').select('order_id, amount, is_paid').eq('user_id', uid).not('order_id', 'is', null),
  ])

  const by = <T extends { order_id: string | null }>(rows: T[] | null) => {
    const m = new Map<string, T[]>()
    for (const r of rows ?? []) {
      if (!r.order_id) continue
      const list = m.get(r.order_id) ?? []
      list.push(r)
      m.set(r.order_id, list)
    }
    return m
  }
  const linesBy = by(lines as { id: string; order_id: string; qty: number; sell_rate: number; cost_rate: number; shipped_qty: number }[] | null)
  const costsBy = by(costs as { order_id: string; name: string; sign: number; basis: 'flat' | 'pct_customer' | 'pct_supplier' | 'pct_gross'; planned: number; actual: number | null }[] | null)
  const invBy = by(custInv as { order_id: string; total: number; balance_due: number; status: string }[] | null)

  // What each order has been invoiced, worked out from the LINES so one
  // invoice can cover two orders and two invoices can split one. An invoice
  // whose lines carry no tag still counts in full against the order it was
  // raised from — see lib/orders/invoiceAllocation.ts.
  const linesByInvoice = new Map<string, { orderId: string | null; amount: number }[]>()
  for (const l of (invLines ?? []) as { invoice_id: string; order_id: string | null; amount: number }[]) {
    const list = linesByInvoice.get(l.invoice_id) ?? []
    list.push({ orderId: l.order_id, amount: Number(l.amount) || 0 })
    linesByInvoice.set(l.invoice_id, list)
  }
  const invoiceModels: InvoiceLike[] = ((custInv ?? []) as { id: string; order_id: string | null; total: number }[])
    .map(i => ({
      id: i.id,
      orderId: i.order_id ?? null,
      total: Number(i.total) || 0,
      lines: linesByInvoice.get(i.id) ?? [],
    }))
  const billBy = by(bills as { order_id: string; amount: number; is_paid: boolean }[] | null)

  // Size rows decide a line's quantity — see lib/orders/sizes.ts.
  const sizesByLine = new Map<string, { label: string; qty: number; shippedQty: number }[]>()
  for (const s of (sizes ?? []) as { line_id: string; qty: number; shipped_qty: number }[]) {
    const list = sizesByLine.get(s.line_id) ?? []
    list.push({ label: 'x', qty: Number(s.qty) || 0, shippedQty: Number(s.shipped_qty) || 0 })
    sizesByLine.set(s.line_id, list)
  }

  const summaryRows: OrderSummaryRow[] = []
  // One "today" for the whole page, from the server — otherwise two rows
  // rendered either side of midnight could disagree about what is late.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const rows: OrderListRow[] = (orders ?? []).map(o => {
    const myLines = (linesBy.get(o.id) ?? []).map(l => {
      const sz = sizesByLine.get(l.id) ?? []
      return { qty: lineQty(Number(l.qty), sz), sellRate: Number(l.sell_rate), costRate: Number(l.cost_rate), shippedQty: Number(l.shipped_qty), sizes: sz }
    })
    const planned = plannedFromLines(myLines)
    const actualCustomer = invoicedForOrder(invoiceModels, o.id)
    const actualSupplier = (billBy.get(o.id) ?? []).reduce((t, b) => t + Number(b.amount || 0), 0)
    const m = computeMargin({
      customerValuePlanned: planned.customerValue,
      customerValueActual: actualCustomer,
      bookedRate: Number(o.booked_rate) || 1,
      realisedRate: o.realised_rate == null ? null : Number(o.realised_rate),
      supplierCostPlanned: planned.supplierCost,
      supplierCostActual: actualSupplier,
      drawback: o.drawback_basis ? { basis: o.drawback_basis, value: Number(o.drawback_value) || 0, actual: o.drawback_actual == null ? null : Number(o.drawback_actual) } : null,
      costs: (costsBy.get(o.id) ?? []).map(c => ({ name: c.name, sign: c.sign === 1 ? 1 : -1, basis: c.basis, planned: Number(c.planned) || 0, actual: c.actual })),
    })
    // The Actual column stands in the costed figures for whatever has not
    // happened yet (see margin.ts), so it reads as EXPECTED profit until the
    // invoice and the supplier bill are both in, and as ACTUAL after. The
    // list no longer has to choose a column.
    const col = m.actual

    const shipBalance = myLines.reduce(
      (t, l) => t + Math.max(0, l.qty - Math.min(lineShipped(l.shippedQty, l.sizes), l.qty)), 0)
    summaryRows.push({
      stage: o.stage,
      net: col.net,
      valueInr: col.customerValueInr,
      receivable: (invBy.get(o.id) ?? []).reduce((t, i) => t + (Number(i.balance_due) || 0), 0),
      payable: (billBy.get(o.id) ?? []).filter(b => !b.is_paid).reduce((t, b) => t + (Number(b.amount) || 0), 0),
      drawbackDue: o.drawback_basis && o.drawback_actual == null ? col.drawback : 0,
      shipBalance,
    })

    return {
      id: o.id, number: o.number, customer_name: o.customer_name,
      customer_po_no: o.customer_po_no, order_date: o.order_date,
      stage: o.stage as OrderStage, currency: o.currency,
      value: col.customerValueFx,
      // Rupees as well as the order's own currency: a list holding $48,000
      // and ₹2,00,000 cannot be sorted or totalled on the cell figure.
      valueInr: col.customerValueInr,
      invoicedInr: actualCustomer * (Number(o.realised_rate) || Number(o.booked_rate) || 1),
      net: col.net, marginPct: col.marginPct,
      estimated: !m.actualIsComplete,
      flags: orderDateFlags({
        cutoffDate: o.cutoff_date, etd: o.etd, stage: o.stage,
        fullyShipped: myLines.length > 0 && shipBalance === 0,
      }, today),
    }
  })

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <OrdersClient rows={rows} summary={summariseOrders(summaryRows)} />
    </div>
  )
}
