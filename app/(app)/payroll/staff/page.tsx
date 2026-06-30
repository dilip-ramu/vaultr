export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StaffClient from '@/components/payroll/staff/StaffClient'
import type { Employee } from '@/lib/payroll/types'

export default async function StaffPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: employees }, { data: customers }] = await Promise.all([
    supabase
      .from('employees')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name'),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StaffClient employees={(employees ?? []) as Employee[]} customers={customers ?? []} />
    </div>
  )
}
