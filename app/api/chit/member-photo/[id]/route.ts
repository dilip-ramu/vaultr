// A member's photograph, for the chit operator.
//
// The bucket is private, so this streams the file after checking the member
// belongs to the signed-in account. Same shape as the portal's own route, and
// the same reason: a face is not a company logo.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveChitAccess } from '@/lib/chit/access'

export const dynamic = 'force-dynamic'

const BUCKET = 'vaultr-member-photos'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await resolveChitAccess()
  if (!access) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const db = admin()

  const { data: row } = await db.from('chit_members')
    .select('photo_path').eq('id', id).eq('user_id', access.ownerId).maybeSingle()

  const path = String(row?.photo_path ?? '')
  if (!path) return new NextResponse('No photo', { status: 404 })

  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) return new NextResponse('No photo', { status: 404 })

  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
