import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — upload a DOCUMENT logo (printed on invoices/PDFs, separate from the
// app logo) into the public vaultr-avatars bucket at
//   <user_id>/companies/<company_id>-doc.<ext>
// and save document_logo_path on the company row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'File too large — max 2 MB' }, { status: 400 })

  const lower = file.name.toLowerCase()
  const ext = lower.endsWith('.png') ? 'png'
    : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'jpg'
    : lower.endsWith('.webp') ? 'webp'
    : lower.endsWith('.svg') ? 'svg'
    : null
  if (!ext) return NextResponse.json({ error: 'Use PNG, JPG, WEBP, or SVG' }, { status: 400 })

  const path = `${user.id}/companies/${id}-doc.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage.from('vaultr-avatars')
    .upload(path, bytes, { contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: updated, error: dbErr } = await supabase.from('companies')
    .update({ document_logo_path: path, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id).select('*').single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
  const version = updated?.updated_at ? Date.parse(updated.updated_at) : Date.now()
  return NextResponse.json({ company: updated, publicUrl: `${publicUrl}?v=${version}` })
}

// DELETE — remove the document logo + clear document_logo_path.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies').select('document_logo_path').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  if (company.document_logo_path) await supabase.storage.from('vaultr-avatars').remove([company.document_logo_path])
  await supabase.from('companies').update({ document_logo_path: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
