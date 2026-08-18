import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runResearchUpdate } from '@/lib/investments/lab/cycle'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — Research Update: refresh intelligence (corporate actions, marks, market
// regime) WITHOUT trading. Separate from the Investment Cycle by design.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('id')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ error: 'No Lab' }, { status: 400 })

  try {
    const summary = await runResearchUpdate(supabase, user.id, lab.id)
    return NextResponse.json({ summary })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Research update failed' }, { status: 500 })
  }
}
