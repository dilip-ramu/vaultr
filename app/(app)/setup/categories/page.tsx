import { createClient } from '@/lib/supabase/server'
import CategoriesClient from '@/components/categories/CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function SetupCategoriesTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')

  return <CategoriesClient initialCategories={categories ?? []} />
}
