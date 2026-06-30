import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getReimbursableCustomers } from '@/lib/reimbursables/customers'
import ReimbursablesTabs from '@/components/customers/reimbursables/ReimbursablesTabs'
import ReimbursableCustomerPicker from '@/components/customers/reimbursables/ReimbursableCustomerPicker'
import ReimbursablesNewInvoiceLink from '@/components/customers/reimbursables/ReimbursablesNewInvoiceLink'

export default async function ReimbursablesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const customers = user ? await getReimbursableCustomers(supabase, user.id) : []

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Reimbursables</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Expenses any of your customers reimburses, and the invoices you've issued to them.
            </p>
          </div>
          {/* + New invoice carries the currently-selected customer into the
              create flow so the right customer is preselected. */}
          <Suspense fallback={null}>
            <ReimbursablesNewInvoiceLink />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <ReimbursableCustomerPicker customers={customers} />
        </Suspense>
        <ReimbursablesTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
