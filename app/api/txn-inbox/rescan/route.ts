import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — clear pending + dismissed drafts so their source emails can be
// re-fetched (useful while tuning a bank's parser). APPROVED drafts are kept,
// so their emails stay de-duplicated and never create a duplicate transaction.
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('transaction_drafts')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .in('status', ['pending', 'dismissed', 'needs_account'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cleared: count ?? 0 })
}
