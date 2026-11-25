// A member's own photograph: theirs to set, theirs to see.
//
// The member is identified by their COOKIE, never by anything in the request.
// The bucket is private, so the photo is streamed through here rather than
// linked — a face is not a company logo.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentPortalSession } from '@/lib/chit/portal-session'
import { photoProblem, photoPath } from '@/lib/chit/memberPhoto'

export const dynamic = 'force-dynamic'

const BUCKET = 'vaultr-member-photos'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** POST — a new photo, replacing whatever was there. */
export async function POST(req: NextRequest) {
  const session = await currentPortalSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No photo was attached.' }, { status: 400 })

  const problem = photoProblem({ type: file.type, size: file.size })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const db = admin()
  const path = photoPath(session.userId, session.memberId, file.type)

  // upsert: one file per member, replaced rather than piled up.
  const { error } = await db.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) return NextResponse.json({ error: 'Could not save the photo.' }, { status: 500 })

  const { data: before } = await db.from('chit_members')
    .select('photo_path').eq('id', session.memberId).eq('user_id', session.userId).maybeSingle()

  await db.from('chit_members')
    .update({ photo_path: path, updated_at: new Date().toISOString() })
    .eq('id', session.memberId).eq('user_id', session.userId)

  // A photo saved under a different extension would otherwise be orphaned.
  const old = String(before?.photo_path ?? '')
  if (old && old !== path) await db.storage.from(BUCKET).remove([old])

  // Recorded like any other change they make, so the operator sees it.
  await db.from('chit_member_changes').insert({
    user_id: session.userId, member_id: session.memberId,
    field: 'photo', old_value: old || null, new_value: 'set',
    sensitive: false, changed_by: 'member',
  })

  return NextResponse.json({ ok: true })
}

/** GET — their own photo. */
export async function GET() {
  const session = await currentPortalSession()
  if (!session) return new NextResponse('Not signed in', { status: 401 })

  const db = admin()
  const { data: row } = await db.from('chit_members')
    .select('photo_path').eq('id', session.memberId).eq('user_id', session.userId).maybeSingle()

  const path = String(row?.photo_path ?? '')
  if (!path) return new NextResponse('No photo', { status: 404 })

  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) return new NextResponse('No photo', { status: 404 })

  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      // One member's own face: never a shared cache.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
