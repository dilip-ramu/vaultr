import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: supplier }, { data: invoices }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('supplier_invoices').select('*').eq('supplier_id', id).eq('user_id', user.id).order('invoice_date', { ascending: false }),
  ])

  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ supplier, invoices: invoices ?? [] })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('suppliers')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplier: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check for existing invoices before deleting
  const { count } = await supabase
    .from('supplier_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id).eq('user_id', user.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Cannot delete supplier with existing invoices. Archive it instead.' }, { status: 400 })
  }

  const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
