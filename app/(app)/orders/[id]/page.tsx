import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import OrderSheet, {
  type OrderRow, type LineRow, type CostRow, type DocRow, type CustInvRow, type BillRow,
} from '@/components/orders/OrderSheet'

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
  ])

  return (
    <OrderSheet
      order={order as OrderRow}
      lines={(lines ?? []) as LineRow[]}
      costs={(costs ?? []) as CostRow[]}
      docs={(docs ?? []) as DocRow[]}
      custInvoices={(custInvoices ?? []) as CustInvRow[]}
      bills={(bills ?? []) as BillRow[]}
      freeSellDocs={(freeSellDocs ?? []) as DocRow[]}
      freeBuyDocs={(freeBuyDocs ?? []) as DocRow[]}
      freeCustInvoices={(freeCustInvoices ?? []) as CustInvRow[]}
      freeBills={(freeBills ?? []) as BillRow[]}
    />
  )
}
