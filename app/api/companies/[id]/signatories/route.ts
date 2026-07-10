import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

// GET — list a company's signatories (with resolved public signature URLs).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('company_signatories')
    .select('*')
    .eq('company_id', id).eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map(s => {
    const signatureUrl = s.signature_path
      ? supabase.storage.from('vaultr-avatars').getPublicUrl(s.signature_path).data.publicUrl
        + `?v=${s.updated_at ? Date.parse(s.updated_at) : Date.now()}`
      : null
    return { ...s, signatureUrl }
  })
  return NextResponse.json({ signatories: rows })
}

// POST — create a signatory. Body: { name, designation?, is_default? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const isDefault = body.is_default === true

  if (isDefault) {
    await supabase.from('company_signatories').update({ is_default: false })
      .eq('company_id', id).eq('user_id', user.id).eq('is_default', true)
  }

  const { data, error } = await supabase.from('company_signatories').insert({
    user_id: user.id,
    company_id: id,
    name,
    designation: (String(body.designation ?? '').trim() || null),
    is_default: isDefault,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signatory: data })
}
