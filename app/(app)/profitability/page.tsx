import { createClient } from '@/lib/supabase/server'
import ProfitabilityClient from '@/components/profitability/ProfitabilityClient'
import type { ProfitabilityData } from '@/lib/profitability'

export const dynamic = 'force-dynamic'

export default async function ProfitabilityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [
    { data: transactions },
    { data: customerInvoices },
    { data: commissionStyles },
    { data: commissionOrders },
    { data: payrollMonths },
    { data: payrollEntries },
    { data: supplierInvoices },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, date, bill_id, supplier_invoice_id, supplier_payment_batch_id, contrast_invoice_id, is_contrast_billed')
      .eq('user_id', uid)
      .order('date', { ascending: false }),
    supabase
      .from('recoverable_invoices')
      .select('id, total, status, invoice_date, due_date, transaction_id')
      .eq('user_id', uid),
    supabase
      .from('commission_styles')
      .select('id, commission_inr, order_status, expected_payment_date, linked_transaction_id, order:commission_orders!order_id(order_date)')
      .eq('user_id', uid),
    supabase
      .from('commission_orders')
      .select('linked_transaction_id')
      .eq('user_id', uid)
      .not('linked_transaction_id', 'is', null),
    supabase
      .from('payroll_months')
      .select('id, payroll_month, payment_date, received_inr, income_transaction_id, forex_transaction_id')
      .eq('user_id', uid),
    supabase
      .from('payroll_entries')
      .select('id, payroll_month_id, final_payable, transaction_id')
      .eq('user_id', uid),
    supabase
      .from('supplier_invoices')
      .select('id, amount, invoice_date, due_date')
      .eq('user_id', uid),
  ])

  const data: ProfitabilityData = {
    transactions: transactions ?? [],
    customerInvoices: customerInvoices ?? [],
    commissionStyles: (commissionStyles ?? []).map(s => {
      const order = s.order as { order_date: string } | { order_date: string }[] | null
      const orderDate = Array.isArray(order) ? order[0]?.order_date : order?.order_date
      return {
        id: s.id,
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

  return <ProfitabilityClient data={data} />
}
