export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProcessingListClient, { type MonthWithTotal } from '@/components/payroll/processing/ProcessingListClient'
import type { PayrollMonth } from '@/lib/payroll/types'

export default async function ProcessingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: months }, { data: entries }] = await Promise.all([
    supabase
      .from('payroll_months')
      .select('*')
      .eq('user_id', user.id)
      .order('payroll_month', { ascending: false }),
    // Just enough to compute per-month total_payable without another round-trip.
    supabase
      .from('payroll_entries')
      .select('payroll_month_id, final_payable')
      .eq('user_id', user.id),
  ])

  // Aggregate total_payable per month.
  const totalsByMonth = new Map<string, number>()
  for (const e of (entries ?? []) as Array<{ payroll_month_id: string; final_payable: number }>) {
    totalsByMonth.set(e.payroll_month_id, (totalsByMonth.get(e.payroll_month_id) ?? 0) + Number(e.final_payable ?? 0))
  }

  const monthsWithTotal: MonthWithTotal[] = ((months ?? []) as PayrollMonth[]).map(m => ({
    ...m,
    total_payable: totalsByMonth.get(m.id) ?? 0,
  }))

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ProcessingListClient months={monthsWithTotal} />
    </div>
  )
}
