// A plain invoice: one step, because there is nothing to gather first.
//
// It still goes through the flow shell so the page says what it is and Back
// returns to the three choices — the commonest mistake at the chooser is
// picking the wrong kind, and the commonest reaction is to press Back.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TypedInvoiceClient from '@/components/customers/invoices/TypedInvoiceClient'
import FlowShell from '@/components/customers/invoices/FlowShell'

export const dynamic = 'force-dynamic'

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
  let orderInitial: { customerId: string; companyId: string; invoiceDate: string; paymentTerms: string; notes: string; currency: string; lines: never[] } | undefined
  let orderCustomer: string | null = null
  if (fromOrder) {
    const { data: ord } = await supabase.from('orders')
      .select('customer_id, company_id, currency, customer_po_no, number')
      .eq('id', fromOrder).eq('user_id', user.id).maybeSingle()
    if (ord) {
      orderCustomer = (ord.customer_id as string | null) ?? null
      orderInitial = {
        customerId: orderCustomer ?? '',
        companyId: (ord.company_id as string | null) ?? '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        paymentTerms: 'due_on_receipt',
        notes: '',
        currency: String(ord.currency ?? 'INR'),
        lines: [],
      }
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
      />
    </FlowShell>
  )
}
