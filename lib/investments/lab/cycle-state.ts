// Cycle persistence and step idempotency (correctness pass, item 1).
//
// A cycle is no longer "one request that does everything". It is a durable
// record with a cursor: an invocation does as much as its budget allows, saves
// exactly where it got to, and returns. The next invocation resumes at the next
// item — never at the first one again.
//
// Idempotency is enforced at the DATABASE, not by hoping the code is careful:
//   • lab_cycle_steps has UNIQUE (cycle_id, step_key). Claiming a step is an
//     insert; if it conflicts, the step was already handled and is skipped.
//   • lab_trades and lab_decisions carry a UNIQUE step_id, so even a duplicated
//     request cannot write the same trade twice.
//
// A step left in 'claimed' means an invocation died mid-flight. That is
// recoverable rather than fatal: lab_trades is the immutable truth, so we check
// whether the trade landed and reconcile from it (see reconcileStep in cycle.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { emptyTotals } from '../models'
import type { LabCycle, LabCycleStep, CycleCursor, CycleCounters, CycleStatus, CyclePhase, CycleStepStatus } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const OPEN_STATUSES: CycleStatus[] = ['started', 'in_progress']

export function emptyCursor(): CycleCursor {
  return {
    holdingQueue: [], holdingIndex: 0,
    discoveryQueue: [], discoveryIndex: 0, discoveryRan: false,
    markDone: false, corporateDone: false,
  }
}

export function emptyCounters(): CycleCounters {
  return {
    analyses: 0, cacheHits: 0, actions: 0, invocations: 0,
    deferred: 0, failures: 0, webSearchBudgetUsed: 0, stageAttempts: 0,
    usage: emptyTotals(),
  }
}

export function stepKey(kind: string, symbol: string, exchange: string): string {
  return `${kind}:${symbol.toUpperCase()}:${exchange}`
}

function hydrate(row: any): LabCycle {
  return {
    id: row.id, lab_id: row.lab_id, user_id: row.user_id,
    status: row.status as CycleStatus, phase: row.phase as CyclePhase,
    cursor: { ...emptyCursor(), ...(row.cursor ?? {}) },
    counters: { ...emptyCounters(), ...(row.counters ?? {}) },
    trading_date: row.trading_date,
    model_version: row.model_version,
    summary: row.summary ?? {},
    error: row.error ?? null,
    started_at: row.started_at, updated_at: row.updated_at, completed_at: row.completed_at ?? null,
  }
}

/** The cycle still awaiting work, if any. At most one can be open per Lab (a
 *  partial unique index enforces it), so a double-click cannot fork the run. */
export async function findOpenCycle(supabase: SupabaseClient, userId: string, labId: string): Promise<LabCycle | null> {
  const { data } = await supabase.from('lab_cycles').select('*')
    .eq('lab_id', labId).eq('user_id', userId).in('status', OPEN_STATUSES)
    .order('started_at', { ascending: false }).limit(1)
  const row = data?.[0]
  return row ? hydrate(row) : null
}

export async function getCycle(supabase: SupabaseClient, userId: string, cycleId: string): Promise<LabCycle | null> {
  const { data } = await supabase.from('lab_cycles').select('*').eq('id', cycleId).eq('user_id', userId).limit(1)
  const row = data?.[0]
  return row ? hydrate(row) : null
}

export async function createCycle(params: {
  supabase: SupabaseClient
  userId: string
  labId: string
  modelVersion: string
  tradingDate: string
  nowIso: string
}): Promise<LabCycle> {
  const { supabase, userId, labId, modelVersion, tradingDate, nowIso } = params
  const { data, error } = await supabase.from('lab_cycles').insert({
    lab_id: labId, user_id: userId, status: 'started', phase: 'mark',
    cursor: emptyCursor(), counters: emptyCounters(),
    trading_date: tradingDate, model_version: modelVersion,
    summary: {}, started_at: nowIso, updated_at: nowIso,
  }).select('*').single()
  if (error || !data) throw new Error(`Could not start a cycle: ${error?.message ?? 'no row returned'}`)
  return hydrate(data)
}

export async function saveCycle(
  supabase: SupabaseClient,
  cycle: LabCycle,
  patch: Partial<Pick<LabCycle, 'status' | 'phase' | 'cursor' | 'counters' | 'summary' | 'error' | 'completed_at'>>,
  nowIso: string,
): Promise<LabCycle> {
  Object.assign(cycle, patch)
  await supabase.from('lab_cycles').update({
    status: cycle.status, phase: cycle.phase, cursor: cycle.cursor, counters: cycle.counters,
    summary: cycle.summary, error: cycle.error, completed_at: cycle.completed_at,
    updated_at: nowIso,
  }).eq('id', cycle.id)
  return cycle
}

export type ClaimOutcome =
  | { state: 'claimed'; step: LabCycleStep }
  | { state: 'settled'; step: LabCycleStep }     // already done/skipped/deferred/failed
  | { state: 'recover'; step: LabCycleStep }     // left mid-flight by a dead invocation

/** Reserve a unit of work. The unique index does the arbitration. */
export async function claimStep(params: {
  supabase: SupabaseClient
  cycle: LabCycle
  key: string
  kind: string
  symbol?: string | null
  exchange?: string | null
  nowIso: string
}): Promise<ClaimOutcome> {
  const { supabase, cycle, key, kind, symbol, exchange, nowIso } = params
  const { data: inserted } = await supabase.from('lab_cycle_steps').upsert({
    cycle_id: cycle.id, lab_id: cycle.lab_id, user_id: cycle.user_id,
    step_key: key, kind, symbol: symbol ?? null, exchange: exchange ?? null,
    status: 'claimed', created_at: nowIso, updated_at: nowIso,
  }, { onConflict: 'cycle_id,step_key', ignoreDuplicates: true }).select('*')

  if (inserted && inserted.length) return { state: 'claimed', step: inserted[0] as LabCycleStep }

  const { data: existing } = await supabase.from('lab_cycle_steps').select('*')
    .eq('cycle_id', cycle.id).eq('step_key', key).limit(1)
  const step = existing?.[0] as LabCycleStep | undefined
  if (!step) {
    // Should not happen; treat as claimable rather than deadlock the cycle.
    return { state: 'claimed', step: { id: '', cycle_id: cycle.id, lab_id: cycle.lab_id, user_id: cycle.user_id, step_key: key, kind, symbol: symbol ?? null, exchange: exchange ?? null, status: 'claimed', reason: null, decision_id: null, trade_id: null, created_at: nowIso, updated_at: nowIso } }
  }
  return step.status === 'claimed' ? { state: 'recover', step } : { state: 'settled', step }
}

/** Advance a security's durable research stage. Called only AFTER the work for
 *  the previous stage has been persisted, so the stage is always a truthful
 *  statement about what has already succeeded. */
export async function setStepStage(
  supabase: SupabaseClient, stepId: string, stage: string, nowIso: string,
): Promise<void> {
  if (!stepId) return
  await supabase.from('lab_cycle_steps')
    .update({ stage, stage_updated_at: nowIso, updated_at: nowIso })
    .eq('id', stepId)
}

/** Record an OPERATIONAL failure against the step — a timeout, a rate limit, a
 *  provider error. Deliberately not a lab_decisions row: a technical failure is
 *  not an investment decision, and repeating one must not pollute the journal. */
export async function noteStepAttempt(
  supabase: SupabaseClient, stepId: string, attempts: number,
  error: string | null, nowIso: string,
): Promise<void> {
  if (!stepId) return
  await supabase.from('lab_cycle_steps')
    .update({ attempts, last_error: error, last_error_at: error ? nowIso : null, updated_at: nowIso })
    .eq('id', stepId)
}

export async function finishStep(params: {
  supabase: SupabaseClient
  stepId: string
  status: CycleStepStatus
  reason?: string | null
  decisionId?: string | null
  tradeId?: string | null
  nowIso: string
}): Promise<void> {
  if (!params.stepId) return
  await params.supabase.from('lab_cycle_steps').update({
    status: params.status,
    reason: params.reason ?? null,
    decision_id: params.decisionId ?? null,
    trade_id: params.tradeId ?? null,
    updated_at: params.nowIso,
  }).eq('id', params.stepId)
}

export async function listSteps(supabase: SupabaseClient, cycleId: string): Promise<LabCycleStep[]> {
  const { data } = await supabase.from('lab_cycle_steps').select('*').eq('cycle_id', cycleId)
  return (data ?? []) as LabCycleStep[]
}

// ── Carrying unevaluated candidates across cycles (efficiency pass) ─────────
//
// An idea scan is one of the Lab's most expensive calls, and it routinely
// returns more names than the cycle's analysis allowance can evaluate. Those
// leftovers used to be discarded with the cycle, so the next cycle paid for a
// scan that largely re-surfaced the same companies.
//
// A candidate is just a name to look at — it is NOT research, NOT a decision,
// and NOT part of the immutable record. Reusing one changes nothing about what
// the Lab concludes: every carried name is still researched from scratch and
// still judged on its own evidence. It only stops us paying to be told about it
// twice.
//
// Reuse is bounded three ways: a TTL, a same-Lab-only restriction, and an
// exclusion of anything now held.

export interface CarryOverCandidates {
  entries: string[]
  fromCycleId: string
  ageHours: number | null
}

export async function readCarryOverCandidates(params: {
  supabase: SupabaseClient
  userId: string
  labId: string
  ttlHours: number
  now?: Date
  /** Symbols already held — never re-queued as a new idea. */
  exclude?: string[]
}): Promise<CarryOverCandidates | null> {
  const { supabase, userId, labId, ttlHours } = params
  const now = params.now ?? new Date()
  const exclude = new Set((params.exclude ?? []).map(s => s.toUpperCase()))

  const { data } = await supabase.from('lab_cycles')
    .select('*')
    .eq('lab_id', labId).eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(5)

  for (const row of (data ?? []) as any[]) {
    const cycle = hydrate(row)
    // An OPEN cycle's queue is still being worked by whoever owns it. Only a
    // finished cycle's leftovers are genuinely abandoned and safe to reuse.
    if (OPEN_STATUSES.includes(cycle.status)) continue
    const stamp = cycle.completed_at ?? cycle.updated_at ?? cycle.started_at
    const age = stamp ? (now.getTime() - new Date(stamp).getTime()) / 3_600_000 : null
    if (age == null || !Number.isFinite(age) || age > ttlHours) continue

    const remaining = (cycle.cursor.discoveryQueue ?? [])
      .slice(cycle.cursor.discoveryIndex ?? 0)
      .filter(entry => {
        const [key] = String(entry).split('|')
        const parts = key.split(':')
        const sym = (parts[1] ?? '').toUpperCase()
        return sym.length > 0 && !exclude.has(sym)
      })

    if (remaining.length) {
      return { entries: remaining, fromCycleId: cycle.id, ageHours: Math.round(age * 10) / 10 }
    }
  }
  return null
}
