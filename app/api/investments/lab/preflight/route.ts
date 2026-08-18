import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchIndexQuote, fetchPrice } from '@/lib/investments/providers/price'
import { researchJson } from '@/lib/investments/claude'
import { resolveTradingDate, istDateString } from '@/lib/investments/marketdate'
import { MODELS } from '@/lib/investments/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Live-readiness preflight (Deploy #4).
 *
 * Answers, from inside the DEPLOYED application, the question "would a real
 * cycle work right now?" — without running one. It checks the database schema,
 * the Lab's own state, and the live Yahoo price path. The Anthropic check is
 * OPT-IN because it costs money on every run.
 *
 * Read-only. It creates nothing, trades nothing, and writes nothing.
 *
 * POST body: { "anthropic": true } to also verify the research path.
 */

const REQUIRED_TABLES = [
  'lab_accounts', 'lab_positions', 'lab_trades', 'lab_decisions',
  'lab_nav_history', 'lab_benchmarks', 'lab_postmortems', 'lab_learnings',
  'lab_reviews', 'lab_dividends', 'lab_corporate_actions',
  'lab_cycles', 'lab_cycle_steps', 'lab_research',
]
const REQUIRED_TRIGGERS = [
  'lab_trades_no_update', 'lab_decisions_no_update',
  'lab_dividends_no_update', 'lab_corporate_actions_no_update',
  'lab_nav_no_backdated_update', 'lab_benchmarks_no_backdated_update',
  'lab_accounts_protect',
]
const REQUIRED_INDEXES = [
  'lab_cycle_steps_unique', 'lab_trades_step_unique', 'lab_decisions_step_unique',
  'lab_cycles_one_open', 'lab_accounts_one_live_per_user',
]
const REQUIRED_NAV_COLUMNS = [
  'data_quality', 'stale', 'fresh_count', 'stale_count', 'session_source', 'marked_at', 'dividends_cum',
]

type Status = 'ok' | 'warn' | 'fail' | 'skipped'
interface Check { name: string; status: Status; detail: string; data?: unknown }

const missing = (required: string[], present: unknown): string[] => {
  const have = new Set(Array.isArray(present) ? (present as string[]) : [])
  return required.filter(r => !have.has(r))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { anthropic?: boolean }
  const checks: Check[] = []
  const started = Date.now()

  // ── 1. Schema ────────────────────────────────────────────────────────────
  const { data: health, error: healthErr } = await supabase.rpc('lab_schema_health')
  if (healthErr || !health) {
    checks.push({
      name: 'Database schema',
      status: 'fail',
      detail: `Could not read schema health (${healthErr?.message ?? 'no result'}). This usually means migration v113 has not been applied yet.`,
    })
  } else {
    const h = health as Record<string, unknown>
    const missTables = missing(REQUIRED_TABLES, h.tables)
    const missTriggers = missing(REQUIRED_TRIGGERS, h.triggers)
    const missIndexes = missing(REQUIRED_INDEXES, h.indexes)
    const missNav = missing(REQUIRED_NAV_COLUMNS, h.nav_columns)
    const hasBaselineCol = Array.isArray(h.account_columns) && (h.account_columns as string[]).includes('benchmark_start')

    checks.push({
      name: 'Tables (v110 + v111 + v112)',
      status: missTables.length ? 'fail' : 'ok',
      detail: missTables.length ? `Missing: ${missTables.join(', ')}` : `All ${REQUIRED_TABLES.length} Lab tables present.`,
    })
    checks.push({
      name: 'Immutability triggers',
      status: missTriggers.length ? 'fail' : 'ok',
      detail: missTriggers.length
        ? `Missing: ${missTriggers.join(', ')}. History is NOT protected at the database level.`
        : `All ${REQUIRED_TRIGGERS.length} triggers active — trades, decisions, dividends, corporate actions and past NAV rows cannot be edited by any role.`,
    })
    checks.push({
      name: 'Idempotency indexes',
      status: missIndexes.length ? 'fail' : 'ok',
      detail: missIndexes.length
        ? `Missing: ${missIndexes.join(', ')}. Retries could duplicate trades or create a second Lab.`
        : 'Unique indexes present on cycle steps, trade/decision step ids, open cycles and live Lab accounts.',
    })
    checks.push({
      name: 'v112 columns',
      status: (missNav.length || !hasBaselineCol) ? 'fail' : 'ok',
      detail: (missNav.length || !hasBaselineCol)
        ? `Missing: ${[...missNav, hasBaselineCol ? null : 'lab_accounts.benchmark_start'].filter(Boolean).join(', ')}`
        : 'Data-quality and benchmark-baseline columns present.',
    })
  }

  // ── 2. Lab state ─────────────────────────────────────────────────────────
  const { data: lab } = await supabase.from('lab_accounts')
    .select('id, status, starting_capital, cash, start_date, benchmark_start, model_version')
    .eq('user_id', user.id).in('status', ['active', 'pending_baseline', 'paused']).limit(1).maybeSingle()

  if (!lab) {
    checks.push({ name: 'Lab account', status: 'warn', detail: 'No Lab exists yet. This is the expected state before the experiment is started.' })
  } else {
    const base = lab.benchmark_start as { nifty50_level?: number; nifty500_level?: number; as_of?: string } | null
    checks.push({
      name: 'Lab account',
      status: 'ok',
      detail: `${lab.status}, started ${lab.start_date}, model ${lab.model_version}`,
      data: { startingCapital: lab.starting_capital, cash: lab.cash },
    })
    checks.push({
      name: 'Benchmark baseline',
      status: base?.nifty50_level && base?.nifty500_level ? 'ok' : 'fail',
      detail: base?.nifty50_level
        ? `Pinned ${base.as_of}: Nifty 50 ${base.nifty50_level}, Nifty 500 ${base.nifty500_level}. Immutable once set.`
        : 'Not established — the Lab will refuse to run a cycle until it is.',
    })
  }

  // ── 3. Live market data ──────────────────────────────────────────────────
  const t0 = Date.now()
  const [n50, n500, probe] = await Promise.all([
    fetchIndexQuote('^NSEI', { timeoutMs: 8000, retries: 1 }),
    fetchIndexQuote('^CRSLDX', { timeoutMs: 8000, retries: 1 }),
    fetchPrice('RELIANCE', 'NSE', { timeoutMs: 8000, retries: 1 }),
  ])
  const session = resolveTradingDate({ indexMarketTimeSec: n50?.marketTime ?? n500?.marketTime ?? null })
  const priced = [n50, n500, probe].filter(Boolean).length

  checks.push({
    name: 'Live prices (Yahoo)',
    status: priced === 3 ? 'ok' : priced > 0 ? 'warn' : 'fail',
    detail: priced === 3
      ? `All three quotes returned in ${Date.now() - t0}ms.`
      : priced > 0
        ? `Only ${priced} of 3 quotes returned. A failed quote carries the last valid price forward and marks it stale — it never creates a loss.`
        : 'No quotes returned. Marking would carry prices forward; a brand-new position could not be valued at all.',
    data: {
      nifty50: n50?.price ?? null,
      nifty500: n500?.price ?? null,
      reliance: probe?.price ?? null,
      latencyMs: Date.now() - t0,
    },
  })
  checks.push({
    name: 'Trading session date',
    status: session.sessionKnown ? 'ok' : 'warn',
    detail: `Marks would be recorded against ${session.date} (source: ${session.source}). Today in IST is ${istDateString()}.`
      + (session.note ? ` ${session.note}` : ''),
  })

  // ── 4. Live research (opt-in — this one costs money) ─────────────────────
  if (body.anthropic) {
    const t1 = Date.now()
    const r = await researchJson<{ index?: string; level?: number | null }>({
      system: 'You verify connectivity. Answer only with the requested JSON.',
      prompt: 'Using web search, report the most recent closing level of the Nifty 50. Return ONLY {"index":"NIFTY 50","level":number|null}.',
      webSearch: true, maxUses: 1, maxTokens: 512, retries: 1, timeoutMs: 30_000,
    })
    checks.push({
      name: 'Live research (Anthropic)',
      status: r.failure ? 'fail' : 'ok',
      detail: r.failure
        ? `${r.failure.kind}: ${r.failure.message}. A failure here defers the Lab's decisions — it never becomes an investment conclusion.`
        : `Authenticated, ${MODELS.analysis} responded with parseable JSON and ${r.sources.length} citation${r.sources.length === 1 ? '' : 's'} in ${Date.now() - t1}ms.`,
      data: r.failure ? undefined : { model: MODELS.analysis, parsed: r.data, citations: r.sources.slice(0, 3) },
    })
  } else {
    checks.push({
      name: 'Live research (Anthropic)',
      status: 'skipped',
      detail: 'Not tested — this check makes a real billed API call. Re-run with { "anthropic": true } to verify authentication, model, web search and citations.',
    })
  }

  const fails = checks.filter(c => c.status === 'fail').length
  const warns = checks.filter(c => c.status === 'warn').length
  return NextResponse.json({
    ok: fails === 0,
    summary: fails === 0
      ? (warns ? `Ready, with ${warns} thing${warns === 1 ? '' : 's'} to note.` : 'Ready to run a live cycle.')
      : `${fails} check${fails === 1 ? '' : 's'} failed — do not start the experiment yet.`,
    checks,
    elapsedMs: Date.now() - started,
  })
}
