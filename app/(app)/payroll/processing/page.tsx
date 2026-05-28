export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProcessingListClient from '@/components/payroll/processing/ProcessingListClient'
import type { PayrollMonth } from '@/lib/payroll/types'

export default async function ProcessingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: months } = await supabase
    .from('payroll_months')
    .select('*')
    .eq('user_id', user.id)
    .order('payroll_month', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ProcessingListClient months={(months ?? []) as PayrollMonth[]} />
    </div>
  )
}
