import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TypedInvoiceClient from '@/components/customers/invoices/TypedInvoiceClient'

export const dynamic = 'force-dynamic'

/**
 * Customers → Invoices → New (blank typed invoice).
 * Free-form GST tax invoice: pick a customer + company, type each line
 * (description, qty, rate, HSN, GST%), and create. For reimbursable customers
 * the user reaches the reimbursables builder instead (chooser on the list).
 */
export default async function NewTypedInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { customer: customerParam } = await searchParams

  const [{ data: customers }, { data: companies }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name'),
    supabase
      .from('companies')
      .select('id, name, is_default, cgst_rate, sgst_rate, hsn_sac')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
  ])

  return (
    <TypedInvoiceClient
      customers={(customers ?? []).map(c => ({ id: c.id, name: c.name }))}
      companies={(companies ?? []).map(c => ({
        id: c.id,
        name: c.name,
        is_default: !!c.is_default,
        cgst_rate: Number(c.cgst_rate ?? 9),
        sgst_rate: Number(c.sgst_rate ?? 9),
        hsn_sac: (c.hsn_sac as string | null) ?? '996812',
      }))}
      initialCustomerId={customerParam && customerParam !== 'all' ? customerParam : null}
    />
  )
}
