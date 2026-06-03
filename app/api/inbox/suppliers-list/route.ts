import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — returns active suppliers for the review modal dropdown
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, payment_terms, custom_terms_days')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ suppliers: suppliers ?? [] })
}
