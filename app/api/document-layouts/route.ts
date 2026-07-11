import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/document-layouts?company=<id>&format=<format> → { schema | null }
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = req.nextUrl.searchParams.get('company')
  const format = req.nextUrl.searchParams.get('format')
  if (!company || !format) return NextResponse.json({ error: 'company and format required' }, { status: 400 })

  const { data } = await supabase.from('document_layouts')
    .select('schema').eq('user_id', user.id).eq('company_id', company).eq('format', format).maybeSingle()
  return NextResponse.json({ schema: data?.schema ?? null })
}

// PUT — upsert the layout. Body: { companyId, format, schema }
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { companyId?: string; format?: string; schema?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.companyId || !body.format || !body.schema) return NextResponse.json({ error: 'companyId, format, schema required' }, { status: 400 })

  const { error } = await supabase.from('document_layouts').upsert({
    user_id: user.id, company_id: body.companyId, format: body.format,
    schema: body.schema, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,company_id,format' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?company=&format= → reset to the built-in design.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = req.nextUrl.searchParams.get('company')
  const format = req.nextUrl.searchParams.get('format')
  if (!company || !format) return NextResponse.json({ error: 'company and format required' }, { status: 400 })
  await supabase.from('document_layouts').delete().eq('user_id', user.id).eq('company_id', company).eq('format', format)
  return NextResponse.json({ ok: true })
}
