export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import CategoryDetailClient from '@/components/categories/CategoryDetailClient'

export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: category }, { data: transactions }, { data: assets }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle(),
    // Fetch ALL transactions in this category. The client filters by period.
    // Joined account/category for the existing TransactionItem renderer.
    supabase
      .from('transactions')
      .select(`*, account:accounts!account_id(id,name,color,type,custom_type_id), to_account:accounts!to_account_id(id,name,color), category:categories(id,name,icon,color,type,avatar_url), attachments(*)`)
      .eq('user_id', user.id)
      .eq('category_id', id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    // A category can fund an asset: everything filed under it builds up there
    // with nothing to click. See lib/assets/construction.ts.
    supabase.from('assets').select('id, name, category').eq('user_id', user.id)
      .eq('status', 'held').order('name'),
  ])

  if (!category) notFound()

  return (
    <CategoryDetailClient
      category={category}
      transactions={transactions ?? []}
      assets={((assets ?? []) as { id: string; name: string }[]).map(a => ({ id: a.id, name: a.name }))}
    />
  )
}
