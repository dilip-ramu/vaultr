import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DocType } from '@/lib/templates/schema'

// ── GET ── all assignments for the user (company_id, doc_type -> template_id)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('document_template_assignments')
    .select('company_id, doc_type, template_id').eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data ?? [] })
}

// ── PUT ── set (or clear) the template for a (company, doc_type).
// template_id null clears the assignment → falls back to the built-in layout.
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { company_id?: string | null; doc_type?: DocType; template_id?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const company_id = body.company_id ?? null
  const doc_type = body.doc_type
  if (!doc_type) return NextResponse.json({ error: 'doc_type is required' }, { status: 400 })

  // Delete any existing assignment for this scope (null-safe match).
  let del = supabase.from('document_template_assignments').delete().eq('user_id', user.id).eq('doc_type', doc_type)
  del = company_id ? del.eq('company_id', company_id) : del.is('company_id', null)
  await del

  if (body.template_id) {
    const { error } = await supabase.from('document_template_assignments')
      .insert({ user_id: user.id, company_id, doc_type, template_id: body.template_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
