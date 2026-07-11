import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'node:crypto'

// GET — the user's image asset library.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('template_assets')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data ?? [] })
}

// POST — upload an image into the library (multipart: file, optional name).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'File too large — max 4 MB' }, { status: 400 })

  const lower = file.name.toLowerCase()
  const ext = lower.endsWith('.png') ? 'png'
    : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'jpg'
    : lower.endsWith('.webp') ? 'webp'
    : lower.endsWith('.svg') ? 'svg'
    : null
  if (!ext) return NextResponse.json({ error: 'Use PNG, JPG, WEBP, or SVG' }, { status: 400 })

  const path = `${user.id}/templates/${randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage.from('vaultr-avatars')
    .upload(path, bytes, { contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
  const name = String(form.get('name') ?? '').trim() || file.name.replace(/\.[^.]+$/, '')

  const { data, error } = await supabase.from('template_assets').insert({
    user_id: user.id, name, url: publicUrl, path,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ asset: data })
}
