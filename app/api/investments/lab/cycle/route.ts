import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runInvestmentCycle } from '@/lib/investments/lab/cycle'
import { findOpenCycle, listSteps } from '@/lib/investments/lab/cycle-state'

export const dynamic = 'force-dynamic'
// One INVOCATION, not one cycle. The engine yields on its own budget
// (constraints.invocation_budget_ms, default 45s) and persists a cursor, so this
// never needs to outlive the platform's limit — and raising maxDuration is
// explicitly not how the timeout problem is solved.
export const maxDuration = 60

// GET — the state of the open (or most recent) cycle, so a caller can see
// whether work remains without starting anything.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('id')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ cycle: null, steps: [] })

  const open = await findOpenCycle(supabase, user.id, lab.id)
  if (open) return NextResponse.json({ cycle: open, steps: await listSteps(supabase, open.id), resumable: true })

  const { data: last } = await supabase.from('lab_cycles').select('*')
    .eq('lab_id', lab.id).eq('user_id', user.id)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({
    cycle: last ?? null,
    steps: last ? await listSteps(supabase, last.id) : [],
    resumable: false,
  })
}

/**
 * POST — run ONE INVOCATION of the Investment Cycle (manual trigger only).
 *
 * If a cycle is already open this CONTINUES it from its cursor; it never starts
 * over at the first holding. The engine is decoupled from the trigger, so the
 * same call can later be made by a scheduler or an event without changing it.
 * No broker, ever.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('id, status, benchmark_start')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline']).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ error: 'No Lab — create it first' }, { status: 400 })
  if (lab.status === 'pending_baseline' || !lab.benchmark_start) {
    return NextResponse.json({
      error: 'This Lab has no pinned benchmark baseline, so its performance could not be measured. Establish the baseline first (POST /api/investments/lab/account with { "op": "baseline" }).',
    }, { status: 409 })
  }

  try {
    const summary = await runInvestmentCycle(supabase, user.id, lab.id)
    return NextResponse.json({ summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cycle failed'
    // Mark the open cycle failed so it is visible rather than silently stuck.
    const open = await findOpenCycle(supabase, user.id, lab.id)
    if (open) {
      await supabase.from('lab_cycles')
        .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
        .eq('id', open.id)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
