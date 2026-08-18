import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markLab, captureBenchmarkBaseline } from '@/lib/investments/lab/marking'
import { findOpenCycle } from '@/lib/investments/lab/cycle-state'
import { DEFAULT_LAB_CONSTRAINTS, validateConstraints } from '@/lib/investments/lab/config'
import { DEFAULT_COST_MODEL } from '@/lib/investments/lab/costs'
import { MODEL_VERSION } from '@/lib/investments/lab/methodology'
import { istDateString } from '@/lib/investments/marketdate'
import type { LabAccount } from '@/lib/investments/lab/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET — the active Lab with positions, latest marks and any open cycle.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lab } = await supabase.from('lab_accounts').select('*')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline'])
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!lab) return NextResponse.json({ lab: null })

  const [{ data: positions }, { data: nav }, { data: bench }, openCycle] = await Promise.all([
    supabase.from('lab_positions').select('*').eq('lab_id', lab.id).order('opened_at', { ascending: true }),
    supabase.from('lab_nav_history').select('*').eq('lab_id', lab.id).order('as_of', { ascending: false }).limit(1),
    supabase.from('lab_benchmarks').select('*').eq('lab_id', lab.id).order('as_of', { ascending: false }).limit(1),
    findOpenCycle(supabase, user.id, lab.id),
  ])

  return NextResponse.json({
    lab,
    positions: positions ?? [],
    nav: nav?.[0] ?? null,
    benchmark: bench?.[0] ?? null,
    openCycle,
    baselinePinned: Boolean(lab.benchmark_start),
  })
}

/**
 * POST — create the Lab, or retry pinning its benchmark baseline.
 *
 * Item 7: the baseline is captured ONCE, here, and stored permanently. If the
 * index levels cannot be read, the account is created in `pending_baseline` and
 * refuses to trade — we never silently substitute a later level, because that
 * would make the benchmark read flat for the life of the experiment.
 *
 * Body: { op?: 'create' | 'baseline' }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const op = String(body.op ?? 'create')

  const { data: existing } = await supabase.from('lab_accounts').select('*')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline']).limit(1).maybeSingle()

  // ── Retry the baseline for a Lab that is waiting on it ────────────────────
  if (op === 'baseline' || (existing && !existing.benchmark_start)) {
    if (!existing) return NextResponse.json({ error: 'No Lab to establish a baseline for.' }, { status: 400 })
    if (existing.benchmark_start) return NextResponse.json({ lab: existing, created: false, baselinePinned: true })

    const { baseline, reason } = await captureBenchmarkBaseline()
    if (!baseline) return NextResponse.json({ lab: existing, baselinePinned: false, error: reason }, { status: 503 })

    const { data: updated, error } = await supabase.from('lab_accounts')
      .update({ benchmark_start: baseline, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', existing.id).eq('user_id', user.id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try { await markLab(supabase, user.id, updated as LabAccount) } catch { /* first mark is best-effort */ }
    return NextResponse.json({ lab: updated, created: false, baselinePinned: true })
  }

  if (existing) return NextResponse.json({ lab: existing, created: false, baselinePinned: Boolean(existing.benchmark_start) })

  // ── Create ────────────────────────────────────────────────────────────────
  const problems = validateConstraints(DEFAULT_LAB_CONSTRAINTS)
  if (problems.length) return NextResponse.json({ error: `Lab constraints are invalid: ${problems.join(' ')}` }, { status: 500 })

  const { baseline, reason } = await captureBenchmarkBaseline()

  const { data: lab, error } = await supabase.from('lab_accounts').insert({
    user_id: user.id, name: 'Inex Investment Lab',
    starting_capital: 1_000_000, cash: 1_000_000, start_date: istDateString(),
    model_version: MODEL_VERSION,
    status: baseline ? 'active' : 'pending_baseline',
    constraints: DEFAULT_LAB_CONSTRAINTS,
    cost_model: DEFAULT_COST_MODEL,
    benchmark_start: baseline,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (baseline) {
    try { await markLab(supabase, user.id, lab as LabAccount) } catch { /* first mark is best-effort */ }
  }

  return NextResponse.json({
    lab, created: true, baselinePinned: Boolean(baseline),
    warning: baseline ? null : `${reason} Call POST /api/investments/lab/account with { "op": "baseline" } to try again; the Lab will not trade until then.`,
  })
}
