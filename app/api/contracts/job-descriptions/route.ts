import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET ── all job descriptions for the user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('job_descriptions')
    .select('id, company_id, designation, description, updated_at').eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobDescriptions: data ?? [] })
}

// ── PUT ── upsert a JD for a (company, designation) scope
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { company_id?: string | null; designation?: string; description?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const company_id = body.company_id ?? null
  const designation = (body.designation ?? '').trim()
  const description = body.description ?? ''
  if (!designation) return NextResponse.json({ error: 'Designation is required' }, { status: 400 })

  // Replace any existing JD for this exact scope (null-safe, case-insensitive).
  let del = supabase.from('job_descriptions').delete().eq('user_id', user.id).ilike('designation', designation)
  del = company_id ? del.eq('company_id', company_id) : del.is('company_id', null)
  await del

  const { data, error } = await supabase.from('job_descriptions')
    .insert({ user_id: user.id, company_id, designation, description })
    .select('id, company_id, designation, description, updated_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobDescription: data }, { status: 201 })
}
