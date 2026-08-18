import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET — dividends received and corporate actions processed.
 *
 * Dividends are credited to virtual cash when they are recorded, so they are
 * already inside portfolio value; the total is reported here so total return can
 * be separated from price return without double-counting.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('id')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline', 'paused']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ dividends: [], corporateActions: [], totalNet: 0 })

  const [{ data: dividends }, { data: actions }] = await Promise.all([
    supabase.from('lab_dividends').select('*').eq('lab_id', lab.id).eq('user_id', user.id)
      .order('ex_date', { ascending: false }).limit(300),
    supabase.from('lab_corporate_actions').select('*').eq('lab_id', lab.id).eq('user_id', user.id)
      .order('ex_date', { ascending: false }).limit(300),
  ])

  const totalNet = (dividends ?? []).reduce((t, d) => t + Number(d.net_dividend || 0), 0)
  return NextResponse.json({
    dividends: dividends ?? [],
    corporateActions: actions ?? [],
    totalNet: Math.round(totalNet * 100) / 100,
  })
}
