import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncLedger } from '@/lib/books/sync'

// POST /api/books/sync — mirror transactions into the persisted general ledger
// and return it. Writes only the two ledger tables; never touches anything else.
export async function POST() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const entries = await syncLedger(sb, user.id)
    return NextResponse.json({ entries })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
