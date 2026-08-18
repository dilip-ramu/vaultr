import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markLab } from '@/lib/investments/lab/marking'
import type { LabAccount } from '@/lib/investments/lab/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — mark the Lab to market (prices + benchmarks + NAV snapshot). No trades.
// Reports the data quality honestly: whether the row was written at all, which
// positions were valued at a carried-forward price, and which trading session
// the mark belongs to.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('*')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ error: 'No Lab' }, { status: 400 })

  const r = await markLab(supabase, user.id, lab as LabAccount)
  return NextResponse.json({
    tradingDate: r.tradingDate,
    sessionSource: r.sessionSource,
    navWritten: r.navWritten,
    skippedReason: r.skippedReason,
    quality: r.nav.quality,
    stale: r.nav.stale,
    unpriced: r.nav.unpriced,
    nav: r.nav,
    benchmarks: r.benchmarks,
    drawdownPct: r.drawdownPct,
    notes: r.notes,
  })
}
