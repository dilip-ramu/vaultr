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

// ── POST /api/contracts/templates ── PREPARE an upload.
// The browser uploads the .docx straight to Supabase Storage (no Vercel body
// limit); this route just finds/creates the template row, works out the next
// version + path, and returns a short-lived signed upload URL. The version is
// recorded afterwards via the /finalize route (so a failed upload leaves no
// dangling version). Expects JSON, not the file.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { company_id?: string | null; designation?: string; name?: string | null; file_name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const designation = String(body.designation ?? '').trim()
  const company_id = body.company_id && String(body.company_id) !== '' ? String(body.company_id) : null
  const name = body.name ? String(body.name).trim() : null
  const fileName = String(body.file_name ?? '')
  if (!fileName.toLowerCase().endsWith('.docx')) {
    return NextResponse.json({ error: 'Upload a Word .docx file' }, { status: 400 })
  }

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
  const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (sErr || !signed) return NextResponse.json({ error: sErr?.message ?? 'Could not prepare upload' }, { status: 500 })

  return NextResponse.json({ template_id: templateId, version: nextVersion, path, token: signed.token })
}
