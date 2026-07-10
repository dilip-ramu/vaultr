import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string; sigId: string }> }

// POST — upload a signature image into the PUBLIC vaultr-avatars bucket at
//   <user_id>/signatories/<sigId>.<ext>
// Body: multipart/form-data with a 'file' field. Returns the public URL.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, sigId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sig } = await supabase.from('company_signatories')
    .select('id').eq('id', sigId).eq('company_id', id).eq('user_id', user.id).maybeSingle()
  if (!sig) return NextResponse.json({ error: 'Signatory not found' }, { status: 404 })

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

  const path = `${user.id}/signatories/${sigId}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage.from('vaultr-avatars')
    .upload(path, bytes, { contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: updated, error: dbErr } = await supabase.from('company_signatories')
    .update({ signature_path: path, updated_at: new Date().toISOString() })
    .eq('id', sigId).eq('company_id', id).eq('user_id', user.id)
    .select('*').single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
  const version = updated?.updated_at ? Date.parse(updated.updated_at) : Date.now()
  return NextResponse.json({ signatory: updated, publicUrl: `${publicUrl}?v=${version}` })
}

// DELETE — remove just the signature image (keep the signatory).
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, sigId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sig } = await supabase.from('company_signatories')
    .select('signature_path').eq('id', sigId).eq('company_id', id).eq('user_id', user.id).maybeSingle()
  if (!sig) return NextResponse.json({ error: 'Signatory not found' }, { status: 404 })
  if (sig.signature_path) await supabase.storage.from('vaultr-avatars').remove([sig.signature_path])
  await supabase.from('company_signatories')
    .update({ signature_path: null, updated_at: new Date().toISOString() })
    .eq('id', sigId).eq('company_id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
