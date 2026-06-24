import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'vaultr-attachments'

// Generic attachment upload. The browser POSTs the file here (same-origin, no
// CORS), and the server uploads to Supabase storage server-to-server. This
// avoids all browser↔storage CORS / WebKit upload issues and surfaces the real
// storage error (e.g. "Bucket not found") if something is misconfigured.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  const prefix = (form.get('prefix') as string | null)?.replace(/[^a-z0-9-]/gi, '') ?? ''
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin'
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${user.id}/${prefix ? prefix + '/' : ''}${Date.now()}-${rand}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ path, name: file.name, size: file.size })
}
