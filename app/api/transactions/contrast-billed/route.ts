import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// PATCH /api/transactions/contrast-billed
// Body: { ids: string[], billed: boolean, billing_category_id?: string }
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { ids, billed, billing_category_id } = body as {
    ids: string[]
    billed: boolean
    billing_category_id?: string | null
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { is_contrast_billed: billed }
  if (billing_category_id !== undefined) {
    update.contrast_billing_category_id = billing_category_id
  }

  const { error } = await supabase
    .from('transactions')
    .update(update)
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: ids.length })
}
