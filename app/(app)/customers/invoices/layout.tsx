import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getReimbursableCustomers } from '@/lib/reimbursables/customers'
import InvoicesTabsBar from '@/components/customers/invoices/InvoicesTabsBar'

// Force-dynamic so the tabs + chips update instantly when the URL changes,
// same reasoning as the old /customers/reimbursables layout.
export const dynamic = 'force-dynamic'

/**
 * Restructure Deploy 4 — one Invoices page for the whole customer block.
 *
 * Three tabs under a shared header:
 *   ─ /customers/invoices              → Couriers (batch-first tax invoices)
 *   ─ /customers/invoices/reimbursables → Reimbursables (pending expense queue)
 *   ─ /customers/invoices/list          → Invoices (unified all-invoices list)
 *
 * The chip picker semantics differ per tab:
 *   • Couriers            → chips = every customer that has an invoice
 *   • Reimbursables       → chips = reimbursable customers only (only they
 *                            have payee-tagged expenses that can be queued)
 *   • Invoices (unified)  → chips = every customer (both tax and
 *                            reimbursement invoices flow through here)
 *
 * The shared layout fetches the sets once and lets the tabs bar choose which
 * one to render based on the active route.
 */
export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [reimbursables, { data: allCustomers }] = await Promise.all([
    user ? getReimbursableCustomers(supabase, user.id) : Promise.resolve([]),
    user
      ? supabase.from('customers').select('id, name').eq('user_id', user.id).order('name')
      : Promise.resolve({ data: [] }),
  ])

  return (
    <div>
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Invoices</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Everything you bill to customers — courier tax invoices from the CSV pipeline, reimbursement invoices bundled per month, and a combined list of both.
          </p>
        </div>
        <Suspense fallback={null}>
          <InvoicesTabsBar
            reimbursableCustomers={reimbursables.map(c => ({ id: c.id, name: c.name }))}
            allCustomers={(allCustomers ?? []) as { id: string; name: string }[]}
          />
        </Suspense>
      </div>
      <div>{children}</div>
    </div>
  )
}
