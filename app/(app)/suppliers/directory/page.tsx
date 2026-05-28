export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierDirectoryClient from '@/components/suppliers/directory/SupplierDirectoryClient'

export default async function SupplierDirectoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SupplierDirectoryClient initialSuppliers={suppliers ?? []} />
    </div>
  )
}
