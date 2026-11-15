// A plain invoice: one step, because there is nothing to gather first.
//
// It still goes through the flow shell so the page says what it is and Back
// returns to the three choices — the commonest mistake at the chooser is
// picking the wrong kind, and the commonest reaction is to press Back.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TypedInvoiceClient from '@/components/customers/invoices/TypedInvoiceClient'
import FlowShell from '@/components/customers/invoices/FlowShell'
import { orderDocLines } from '@/lib/orders/toDocument'
import { defaultGstFor } from '@/lib/documents/money'

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
  let orderInitial: {
    customerId: string; companyId: string; invoiceDate: string; paymentTerms: string
    notes: string; currency: string
    lines: { description: string; hsn: string; qty: string; rate: string; cgst: string; sgst: string }[]
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
      // rather than putting 9 + 9 on a document that must not carry it.
      const half = String(Number(defaultGstFor(currency)) / 2)

      orderInitial = {
        customerId: orderCustomer ?? '',
        companyId: (ord.company_id as string | null) ?? '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        paymentTerms: 'due_on_receipt',
        notes: '',
        currency,
        lines: orderDocLines((ol ?? []).map((l: Record<string, unknown>) => ({
          item: String(l.item ?? ''),
          description: (l.description as string | null) ?? null,
          hsn: (l.hsn_sac as string | null) ?? null,
          qty: Number(l.qty) || 0,
          sellRate: Number(l.sell_rate) || 0,
          costRate: Number(l.cost_rate) || 0,
          sizes: sizesByLine.get(String(l.id)) ?? [],
        })), 'sell').map(l => ({
          description: l.item, hsn: l.hsn, qty: l.qty, rate: l.rate,
          cgst: half, sgst: half,
        })),
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
