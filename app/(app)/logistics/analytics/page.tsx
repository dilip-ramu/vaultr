import { createClient } from '@/lib/supabase/server'
import LogisticsDashboard from '@/components/logistics/analytics/LogisticsDashboard'
import type {
  MonthlyDataPoint,
  ProviderDataPoint,
  CustomerDataPoint,
  OutstandingInvoiceData,
  UnallocatedAWBData,
} from '@/components/logistics/analytics/LogisticsDashboard'

export const dynamic = 'force-dynamic'

function getLast6Months(): { yearMonth: string; label: string }[] {
  const result = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    result.push({
      yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
    })
  }
  return result
}

export default async function LogisticsAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const months = getLast6Months()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]

  const [
    { data: courierRaw },
    { data: supplierRaw },
    { data: outstandingRaw },
    { data: unallocatedRaw },
  ] = await Promise.all([
    supabase
      .from('courier_invoices')
      .select('invoice_date, total_amount, courier_provider')
      .eq('user_id', user!.id)
      .gte('invoice_date', sixMonthsAgoStr),

    supabase
      .from('supplier_invoices')
      .select('invoice_date, total_amount, customer:customers(id, name)')
      .eq('user_id', user!.id)
      .gte('invoice_date', sixMonthsAgoStr),

    supabase
      .from('supplier_invoices')
      .select('id, invoice_number, total_amount, paid_amount, due_date, status, customer:customers(id, name)')
      .eq('user_id', user!.id)
      .in('status', ['sent', 'overdue'])
      .order('due_date', { ascending: true }),

    supabase
      .from('awbs')
      .select('id, awb_number, total_pieces, allocated_pieces, total_charge, shipment_date, courier_invoice_id, courier_invoice:courier_invoices(id, courier_provider)')
      .eq('user_id', user!.id)
      .eq('allocated_pieces', 0)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  // ── Group courier spend by month ───────────────────────────
  const courierByMonth = Object.fromEntries(months.map(m => [m.yearMonth, 0]))
  for (const inv of courierRaw ?? []) {
    const ym = inv.invoice_date?.slice(0, 7)
    if (ym && ym in courierByMonth) courierByMonth[ym] += inv.total_amount ?? 0
  }

  // ── Group supplier billed by month ─────────────────────────
  const billedByMonth = Object.fromEntries(months.map(m => [m.yearMonth, 0]))
  for (const inv of supplierRaw ?? []) {
    const ym = inv.invoice_date?.slice(0, 7)
    if (ym && ym in billedByMonth) billedByMonth[ym] += inv.total_amount ?? 0
  }

  const monthlyData: MonthlyDataPoint[] = months.map(m => {
    const spend = courierByMonth[m.yearMonth]
    const billed = billedByMonth[m.yearMonth]
    const margin = billed - spend
    return {
      ...m,
      courierSpend: spend,
      billed,
      margin,
      marginPct: spend > 0 ? (margin / spend) * 100 : 0,
    }
  })

  // ── Courier provider breakdown ────────────────────────────
  const providerMap = new Map<string, number>()
  for (const inv of courierRaw ?? []) {
    const p = inv.courier_provider ?? 'custom'
    providerMap.set(p, (providerMap.get(p) ?? 0) + (inv.total_amount ?? 0))
  }
  const providerBreakdown: ProviderDataPoint[] = [...providerMap.entries()]
    .map(([provider, amount]) => ({ provider, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── Top customers (last 6 months) ─────────────────────────
  const customerMap = new Map<string, { name: string; totalBilled: number; invoiceCount: number }>()
  for (const inv of supplierRaw ?? []) {
    const c = inv.customer as unknown as { id: string; name: string } | null
    if (!c) continue
    const ex = customerMap.get(c.id)
    if (ex) {
      ex.totalBilled += inv.total_amount ?? 0
      ex.invoiceCount++
    } else {
      customerMap.set(c.id, { name: c.name, totalBilled: inv.total_amount ?? 0, invoiceCount: 1 })
    }
  }
  const topCustomers: CustomerDataPoint[] = [...customerMap.entries()]
    .map(([id, d]) => ({ customerId: id, ...d }))
    .sort((a, b) => b.totalBilled - a.totalBilled)
    .slice(0, 5)

  // ── Outstanding ───────────────────────────────────────────
  const outstandingInvoices: OutstandingInvoiceData[] = (outstandingRaw ?? []).map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    customerName: (inv.customer as unknown as { name: string } | null)?.name ?? '—',
    amount: (inv.total_amount ?? 0) - (inv.paid_amount ?? 0),
    dueDate: inv.due_date,
    status: inv.status as 'sent' | 'overdue',
  }))

  // ── Unallocated AWBs ──────────────────────────────────────
  const unallocatedAWBs: UnallocatedAWBData[] = (unallocatedRaw ?? []).map(awb => {
    const ci = awb.courier_invoice as unknown as { id: string; courier_provider: string } | null
    return {
      id: awb.id,
      awbNumber: awb.awb_number,
      courierId: awb.courier_invoice_id,
      courierProvider: ci?.courier_provider ?? 'custom',
      shipmentDate: awb.shipment_date,
      totalCharge: awb.total_charge,
      totalPieces: awb.total_pieces,
    }
  })

  // ── This-month summary ────────────────────────────────────
  const thisMonth = monthlyData[monthlyData.length - 1]
  const totalOutstanding = outstandingInvoices.reduce((s, i) => s + i.amount, 0)

  return (
    <LogisticsDashboard
      monthlyData={monthlyData}
      providerBreakdown={providerBreakdown}
      topCustomers={topCustomers}
      outstandingInvoices={outstandingInvoices}
      unallocatedAWBs={unallocatedAWBs}
      thisMonthSpend={thisMonth?.courierSpend ?? 0}
      thisMonthBilled={thisMonth?.billed ?? 0}
      thisMonthMargin={thisMonth?.margin ?? 0}
      thisMonthMarginPct={thisMonth?.marginPct ?? 0}
      totalOutstanding={totalOutstanding}
    />
  )
}
