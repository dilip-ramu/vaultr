import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLabOverview } from '@/lib/investments/lab/overview'

export const dynamic = 'force-dynamic'

/**
 * GET — everything the Lab dashboard renders, computed SERVER-SIDE.
 *
 * Deliberately cheap: it reads persisted marks and ledger rows only. Opening the
 * Lab never triggers a price fetch or a Claude call — research happens only when
 * a cycle or a research update is explicitly run.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getLabOverview(supabase, user.id))
}
