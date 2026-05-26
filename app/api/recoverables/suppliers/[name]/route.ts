import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const customerName = decodeURIComponent(name)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: allocations, error } = await supabase
    .from('recoverable_allocations')
    .select(`
      *,
      batch:recoverable_import_batches(id, name, import_date, currency, status)
    `)
    .eq('user_id', user.id)
    .eq('customer_name', customerName)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ allocations: allocations ?? [] })
}
