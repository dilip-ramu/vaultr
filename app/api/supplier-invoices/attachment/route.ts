import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'vaultr-attachments'

// POST — upload attachment, returns storage path
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'bin'
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${user.id}/supplier-invoices/${Date.now()}-${rand}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({
    path,
    name: file.name,
    size: file.size,
    url: urlData.publicUrl,
  })
}

// DELETE — remove attachment from storage
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path } = await req.json()
  if (!path) return NextResponse.json({ error: 'No path' }, { status: 400 })

  // Security: ensure path belongs to this user
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabase.storage.from(BUCKET).remove([path])
  return NextResponse.json({ success: true })
}
