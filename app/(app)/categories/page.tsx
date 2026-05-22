import { createClient } from '@/lib/supabase/server'
import CategoriesClient from '@/components/categories/CategoriesClient'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')

  return <CategoriesClient initialCategories={categories ?? []} />
}
