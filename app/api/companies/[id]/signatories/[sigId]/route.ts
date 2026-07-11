import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string; sigId: string }> }

const UPDATABLE = new Set(['name', 'designation', 'is_default', 'sort_order', 'sign_size_mode', 'sign_size_mm'])

// PATCH — edit a signatory (name / designation / default flag / order).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, sigId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) if (UPDATABLE.has(k)) updates[k] = v
  if ('name' in updates) {
    const nm = String(updates.name ?? '').trim()
    if (!nm) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    updates.name = nm
  }
  if ('designation' in updates) updates.designation = String(updates.designation ?? '').trim() || null
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  if (updates.is_default === true) {
    await supabase.from('company_signatories').update({ is_default: false })
      .eq('company_id', id).eq('user_id', user.id).eq('is_default', true).neq('id', sigId)
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase.from('company_signatories')
    .update(updates)
    .eq('id', sigId).eq('company_id', id).eq('user_id', user.id)
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ signatory: data })
}

// DELETE — remove a signatory (and its signature image).
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, sigId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sig } = await supabase.from('company_signatories')
    .select('signature_path').eq('id', sigId).eq('company_id', id).eq('user_id', user.id).maybeSingle()
  if (sig?.signature_path) {
    await supabase.storage.from('vaultr-avatars').remove([sig.signature_path])
  }
  const { error } = await supabase.from('company_signatories')
    .delete().eq('id', sigId).eq('company_id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
