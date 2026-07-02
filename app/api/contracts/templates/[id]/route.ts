import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'vaultr-attachments'
type RouteContext = { params: Promise<{ id: string }> }

// ── GET ── version history for a template, with short-lived download URLs
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: versions } = await supabase
    .from('contract_template_versions')
    .select('*')
    .eq('template_id', id).eq('user_id', user.id)
    .order('version', { ascending: false })

  const rows = await Promise.all((versions ?? []).map(async v => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(v.file_path as string, 600)
    return {
      version: v.version, file_name: v.file_name, note: v.note,
      created_at: v.created_at, url: data?.signedUrl ?? null,
    }
  }))

  return NextResponse.json({ versions: rows })
}

// ── DELETE ── remove the template + all its versions (files best-effort)
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: versions } = await supabase
    .from('contract_template_versions').select('file_path')
    .eq('template_id', id).eq('user_id', user.id)
  const paths = (versions ?? []).map(v => v.file_path as string)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

  const { error } = await supabase.from('contract_templates').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
