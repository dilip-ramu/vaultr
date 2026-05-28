import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: batch }, { data: invoices }] = await Promise.all([
    supabase.from('bulk_payment_batches').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('supplier_invoices')
      .select('*, supplier:suppliers(id, name)')
      .eq('bulk_payment_batch_id', id)
      .eq('user_id', user.id),
  ])

  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ batch, invoices: invoices ?? [] })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Unlink invoices from batch before deleting
  await supabase
    .from('supplier_invoices')
    .update({ bulk_payment_batch_id: null })
    .eq('bulk_payment_batch_id', id)
    .eq('user_id', user.id)

  const { error } = await supabase.from('bulk_payment_batches').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
