import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'node:crypto'

// POST — upload an image used inside a template (letterhead, watermark, stamp,
// banner…). Stored in the PUBLIC vaultr-avatars bucket; returns the public URL
// which is saved on the element.
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
  const { error } = await supabase.storage.from('vaultr-avatars')
    .upload(path, bytes, { contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
