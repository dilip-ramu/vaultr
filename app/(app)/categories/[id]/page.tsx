export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import CategoryDetailClient from '@/components/categories/CategoryDetailClient'

export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: category }, { data: transactions }] = await Promise.all([
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
  ])

  if (!category) notFound()

  return <CategoryDetailClient category={category} transactions={transactions ?? []} />
}
