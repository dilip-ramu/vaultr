import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'vaultr-attachments'

// ── GET /api/contracts/templates ── list templates with company + version info
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: templates }, { data: companies }] = await Promise.all([
    supabase.from('contract_templates').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('companies').select('id, name').eq('user_id', user.id),
  ])

  const companyName: Record<string, string> = {}
  for (const c of companies ?? []) companyName[c.id as string] = c.name as string

  const rows = (templates ?? []).map(t => ({
    id: t.id,
    company_id: t.company_id,
    company_name: t.company_id ? (companyName[t.company_id as string] ?? 'Unknown company') : 'Personal',
    designation: t.designation,
    name: t.name,
    current_version: t.current_version,
    updated_at: t.updated_at,
  }))

  return NextResponse.json({ templates: rows })
}

// ── POST /api/contracts/templates ── upload a .docx (creates a new version)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  const designation = String(form.get('designation') ?? '').trim()
  const companyRaw = form.get('company_id')
  const company_id = companyRaw && String(companyRaw) !== '' ? String(companyRaw) : null
  const name = form.get('name') ? String(form.get('name')).trim() : null
  const note = form.get('note') ? String(form.get('note')).trim() : null

  // designation is optional now — blank means a company-wide template.
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return NextResponse.json({ error: 'Upload a Word .docx file' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 })

  // Find existing template for this (company, designation), case-insensitive.
  let query = supabase.from('contract_templates').select('*')
    .eq('user_id', user.id).ilike('designation', designation)
  query = company_id ? query.eq('company_id', company_id) : query.is('company_id', null)
  const { data: existing } = await query.maybeSingle()

  let templateId: string
  let nextVersion: number
  if (existing) {
    templateId = existing.id as string
    nextVersion = Number(existing.current_version ?? 0) + 1
  } else {
    const { data: created, error: cErr } = await supabase.from('contract_templates')
      .insert({ user_id: user.id, company_id, designation, name, current_version: 0 })
      .select('id').single()
    if (cErr || !created) return NextResponse.json({ error: cErr?.message ?? 'Could not create template' }, { status: 500 })
    templateId = created.id as string
    nextVersion = 1
  }

  const path = `${user.id}/contracts/templates/${templateId}/v${nextVersion}.docx`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { error: vErr } = await supabase.from('contract_template_versions').insert({
    template_id: templateId, user_id: user.id, version: nextVersion,
    file_path: path, file_name: file.name, note,
  })
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  const update: Record<string, unknown> = { current_version: nextVersion, updated_at: new Date().toISOString() }
  if (name) update.name = name
  await supabase.from('contract_templates').update(update).eq('id', templateId).eq('user_id', user.id)

  return NextResponse.json({ template_id: templateId, version: nextVersion }, { status: 201 })
}
