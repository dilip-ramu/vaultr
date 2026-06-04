import { createClient } from '@/lib/supabase/server'
import ProfitabilityClient from '@/components/profitability/ProfitabilityClient'
import { linesFromRaw, type ProfitLine, type RawProfitData, type RawTxn } from '@/lib/profitability'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Fetch every transaction in pages of 1000 (Supabase caps single queries)
async function fetchAllTransactions(supabase: SupabaseClient, uid: string): Promise<RawTxn[]> {
  const out: RawTxn[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, bill_id, supplier_invoice_id, supplier_payment_batch_id, contrast_invoice_id, is_contrast_billed')
      .eq('user_id', uid)
      .order('date', { ascending: false })
      .range(from, from + 999)
    out.push(...((data ?? []) as RawTxn[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// Fallback path: compute lines in JS when the RPC isn't in the DB yet
async function fetchLinesFallback(supabase: SupabaseClient, uid: string): Promise<ProfitLine[]> {
  const [
    transactions,
    { data: customerInvoices },
    { data: commissionStyles },
    { data: commissionOrders },
    { data: payrollMonths },
    { data: payrollEntries },
    { data: supplierInvoices },
  ] = await Promise.all([
    fetchAllTransactions(supabase, uid),
    supabase.from('recoverable_invoices')
      .select('total, status, invoice_date, due_date, transaction_id').eq('user_id', uid),
    supabase.from('commission_styles')
      .select('commission_inr, order_status, expected_payment_date, linked_transaction_id, order:commission_orders!order_id(order_date)')
      .eq('user_id', uid),
    supabase.from('commission_orders')
      .select('linked_transaction_id').eq('user_id', uid).not('linked_transaction_id', 'is', null),
    supabase.from('payroll_months')
      .select('id, payroll_month, payment_date, received_inr, income_transaction_id, forex_transaction_id')
      .eq('user_id', uid),
    supabase.from('payroll_entries')
      .select('payroll_month_id, final_payable, transaction_id').eq('user_id', uid),
    supabase.from('supplier_invoices')
      .select('amount, invoice_date, due_date').eq('user_id', uid),
  ])

  const raw: RawProfitData = {
    transactions,
    customerInvoices: customerInvoices ?? [],
    commissionStyles: (commissionStyles ?? []).map(s => {
      const order = s.order as { order_date: string } | { order_date: string }[] | null
      const orderDate = Array.isArray(order) ? order[0]?.order_date : order?.order_date
      return {
        commission_inr: s.commission_inr,
        order_status: s.order_status,
        expected_payment_date: s.expected_payment_date,
        linked_transaction_id: s.linked_transaction_id,
        order_date: orderDate ?? null,
      }
    }),
    commissionOrderTxnIds: (commissionOrders ?? []).map(o => o.linked_transaction_id),
    payrollMonths: payrollMonths ?? [],
    payrollEntries: payrollEntries ?? [],
    supplierInvoices: supplierInvoices ?? [],
  }

  return linesFromRaw(raw)
}

export default async function ProfitabilityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fast path: one RPC, all aggregation in Postgres (migration_v31)
  const { data, error } = await supabase.rpc('get_profitability_lines')

  const lines: ProfitLine[] = error
    ? await fetchLinesFallback(supabase, user!.id)
    : (data ?? []).map((r: { kind: string; side: string; source: string; day: string; amount: number | string }) => ({
        kind: r.kind as ProfitLine['kind'],
        side: r.side as ProfitLine['side'],
        source: r.source as ProfitLine['source'],
        day: r.day,
        amount: Number(r.amount),
      }))

  return <ProfitabilityClient lines={lines} />
}
