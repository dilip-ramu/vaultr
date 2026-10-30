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
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customers }, { data: companies }] = await Promise.all([
    supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
    supabase.from('companies').select('*').eq('user_id', user.id)
      .order('is_default', { ascending: false }).order('created_at', { ascending: true }),
  ])

  const query: Record<string, string> = customer ? { customer } : {}

  return (
    <FlowShell flow="direct" step="build" query={query}>
      <TypedInvoiceClient
        customers={(customers ?? []) as never}
        companies={(companies ?? []) as never}
        initialCustomerId={customer ?? null}
      />
    </FlowShell>
  )
}
