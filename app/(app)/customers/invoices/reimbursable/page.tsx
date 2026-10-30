// Reimbursable invoice, start to finish.
//
// This is the flow the whole redesign was for. Sorting expenses into billing
// categories lived on one tab; the invoice that uses them lived on another,
// reachable only by leaving, pressing New, and choosing from a popup. Two
// halves of one job with nothing joining them, and no sign on either screen
// that the other existed.
//
// Now it is two steps of one thing. Sort, continue, invoice.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FlowShell, { FlowFooter } from '@/components/customers/invoices/FlowShell'
import SortExpensesStep from '@/components/customers/invoices/steps/SortExpensesStep'
import ReimbursableBuildStep from '@/components/customers/invoices/steps/ReimbursableBuildStep'
import { resolveStep } from '@/lib/customers/invoiceFlows'
import { getReimbursableCustomers, resolveActiveCustomer } from '@/lib/reimbursables/customers'

export const dynamic = 'force-dynamic'

export default async function ReimbursableFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; customer?: string; invoice?: string }>
}) {
  const { step: rawStep, customer, invoice } = await searchParams
  const step = resolveStep('reimbursable', rawStep)

  const query: Record<string, string> = {}
  if (customer) query.customer = customer
  if (invoice) query.invoice = invoice

  if (step === 'build') {
    return (
      <FlowShell flow="reimbursable" step="build" query={query}>
        <ReimbursableBuildStep customer={customer} invoice={invoice} />
      </FlowShell>
    )
  }

  // How much is still unsorted, so the footer can say what continuing leaves
  // behind rather than letting somebody invoice half their expenses by
  // accident and find out at the end of the month.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const reimbursables = await getReimbursableCustomers(supabase, user.id)
  const active = resolveActiveCustomer(reimbursables, customer ?? null)

  let unsorted = 0
  if (active?.payee_id) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('payee_id', active.payee_id)
      .is('contrast_billing_category_id', null)
      .eq('is_contrast_billed', false)
    unsorted = count ?? 0
  }

  return (
    <FlowShell flow="reimbursable" step="sort" query={query}>
      <SortExpensesStep customer={customer} />

      <FlowFooter
        flow="reimbursable" step="sort" query={query}
        continueTo="build"
        continueLabel="Continue to the invoice"
        note={unsorted > 0
          ? `${unsorted} expense${unsorted === 1 ? '' : 's'} still has no billing category. `
            + 'Anything left unsorted will not appear on the invoice.'
          : 'Everything here has a billing category and will appear on the invoice.'}
      />
    </FlowShell>
  )
}
