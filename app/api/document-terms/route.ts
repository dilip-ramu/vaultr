import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/document-terms → { terms: { [format]: string } }  (global rows only)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('document_terms')
    .select('format, terms').eq('user_id', user.id).is('company_id', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const terms: Record<string, string> = {}
  for (const r of (data ?? []) as { format: string; terms: string | null }[]) terms[r.format] = r.terms ?? ''
  return NextResponse.json({ terms })
}

// PUT — upsert the terms for one format. Body: { format, terms }
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { format?: string; terms?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.format) return NextResponse.json({ error: 'format required' }, { status: 400 })

  // Upsert by hand: the unique index is partial (company_id IS NULL), which
  // Postgres won't accept as an ON CONFLICT target through PostgREST.
  const { data: existing } = await supabase.from('document_terms')
    .select('id').eq('user_id', user.id).eq('format', body.format).is('company_id', null).maybeSingle()

  const payload = { terms: body.terms ?? '', updated_at: new Date().toISOString() }
  const { error } = existing
    ? await supabase.from('document_terms').update(payload).eq('id', (existing as { id: string }).id).eq('user_id', user.id)
    : await supabase.from('document_terms').insert({ user_id: user.id, format: body.format, company_id: null, ...payload })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
