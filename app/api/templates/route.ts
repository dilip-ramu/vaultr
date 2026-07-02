import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { presetSchema, type PresetId, type DocType } from '@/lib/templates/schema'

// ── GET /api/templates?doc_type=gst_invoice ── list the user's templates
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const docType = req.nextUrl.searchParams.get('doc_type')
  let q = supabase.from('document_templates').select('id, doc_type, name, updated_at')
    .eq('user_id', user.id).order('updated_at', { ascending: false })
  if (docType) q = q.eq('doc_type', docType)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

// ── POST /api/templates ── create a template (from a preset, or a full schema)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { doc_type?: DocType; name?: string; preset?: PresetId; accent?: string; schema?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const docType = body.doc_type ?? 'gst_invoice'
  const name = (body.name ?? '').trim() || 'Untitled template'
  const schema = body.schema ?? presetSchema(docType, body.preset ?? 'classic', body.accent)
  if (!schema) return NextResponse.json({ error: 'A schema or preset is required' }, { status: 400 })

  const { data, error } = await supabase.from('document_templates')
    .insert({ user_id: user.id, doc_type: docType, name, schema })
    .select('id, doc_type, name, updated_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}
