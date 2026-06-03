export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplierCategoriesClient from '@/components/suppliers/categories/SupplierCategoriesClient'

export default async function SupplierCategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: suppliers }, { data: categories }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, supplier_code, is_active, default_category_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, type, icon, color, parent_id')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .order('name'),
  ])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SupplierCategoriesClient
        initialSuppliers={(suppliers ?? []) as unknown as import('@/lib/suppliers/types').Supplier[]}
        categories={categories ?? []}
      />
    </div>
  )
}
