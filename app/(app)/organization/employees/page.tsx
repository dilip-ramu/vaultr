export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StaffClient from '@/components/payroll/staff/StaffClient'
import type { Employee } from '@/lib/payroll/types'

/** Organization → Employees tab. Content moved from /payroll/staff — that
 *  URL still resolves via redirect. Fetches the companies list too so the
 *  new company filter chips work. */
export default async function OrganizationEmployeesTab() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: employees }, { data: customers }, { data: companies }] = await Promise.all([
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
    supabase
      .from('companies')
      .select('id, name, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('name'),
  ])

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <StaffClient
        employees={(employees ?? []) as Employee[]}
        customers={customers ?? []}
        companies={(companies ?? []) as { id: string; name: string; is_default: boolean }[]}
      />
    </div>
  )
}
