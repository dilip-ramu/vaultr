import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── POST /api/contracts/templates/finalize ── record a version after the
// browser has uploaded the .docx to Storage (see the prepare step in
// ../route.ts). JSON body: { template_id, version, path, file_name, name? }.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { template_id?: string; version?: number; path?: string; file_name?: string; name?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const templateId = body.template_id
  const version = Number(body.version)
  const path = body.path
  if (!templateId || !version || !path) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Ownership check.
  const { data: tpl } = await supabase.from('contract_templates')
    .select('id').eq('id', templateId).eq('user_id', user.id).maybeSingle()
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { error: vErr } = await supabase.from('contract_template_versions').insert({
    template_id: templateId, user_id: user.id, version,
    file_path: path, file_name: body.file_name ?? null,
  })
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  const update: Record<string, unknown> = { current_version: version, updated_at: new Date().toISOString() }
  if (body.name) update.name = String(body.name).trim()
  await supabase.from('contract_templates').update(update).eq('id', templateId).eq('user_id', user.id)

  return NextResponse.json({ version })
}
