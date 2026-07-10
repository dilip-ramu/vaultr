import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: month } = await supabase
    .from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Idempotent: re-finalizing (or retrying after a partial failure) is allowed.

  const { data: entries } = await supabase
    .from('payroll_entries').select('id').eq('payroll_month_id', id).eq('user_id', user.id)
  if (!entries?.length) return NextResponse.json({ error: 'No payroll entries to finalize — generate entries first.' }, { status: 400 })

  const now = new Date().toISOString()

  // Mark month finalized
  const { data: updatedMonth, error: monthErr } = await supabase
    .from('payroll_months')
    .update({ is_finalized: true, finalized_at: now })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  if (monthErr || !updatedMonth) return NextResponse.json({ error: monthErr?.message ?? 'Could not finalize the month.' }, { status: 500 })

  // Regenerate salary slips (remove any stale ones first so re-finalize is clean).
  const entryIds = entries.map(e => e.id)
  await supabase.from('salary_slips').delete().in('payroll_entry_id', entryIds).eq('user_id', user.id)
  const slipRows = entries.map(e => ({ user_id: user.id, payroll_entry_id: e.id, generated_at: now }))
  const { error: slipErr } = await supabase.from('salary_slips').insert(slipRows)
  if (slipErr) return NextResponse.json({ error: `Month finalized, but salary slips failed: ${slipErr.message}` }, { status: 500 })

  return NextResponse.json({ month: updatedMonth, slip_count: entries.length })
}
