-- READ ONLY. Nothing here writes, alters, drops or resets anything.
-- This is NOT a migration. Do not add it to the migration sequence.
--
-- PURPOSE
-- The app can see what it ATTEMPTED. It cannot see what Anthropic BILLED.
-- These queries establish the first half honestly, from the Lab's own durable
-- records, so the two can be compared against the Anthropic Console by hand.
--
-- Run each block separately in the Supabase SQL editor and read the comments.

-- ── 1. How many research calls did the Lab actually initiate? ───────────────
-- Every step attempt is at least one research call that reached the network.
-- This is a FLOOR, not a total: a step that failed and was retried inside one
-- invocation counts once here.
select
  count(*)                                   as steps,
  coalesce(sum(attempts), 0)                 as step_attempts,
  count(*) filter (where status = 'done')     as completed,
  count(*) filter (where status = 'failed')   as failed,
  count(*) filter (where status = 'deferred') as deferred,
  count(*) filter (where stage = 'fundamentals') as stuck_at_fundamentals,
  count(*) filter (where stage = 'qualitative')  as stuck_at_qualitative
from lab_cycle_steps;

-- ── 2. What each cycle believed it spent ───────────────────────────────────
-- `usage` is populated from this deploy onwards. Cycles that ran before it will
-- show null — that is correct: we do not know, and we will not invent a number.
select
  id, status, phase, trading_date, started_at, completed_at,
  counters->>'invocations'          as invocations,
  counters->>'analyses'             as securities_completed,
  counters->>'stageAttempts'        as research_stages_attempted,
  counters->>'failures'             as failures,
  counters->>'cacheHits'            as cache_hits,
  counters->>'webSearchBudgetUsed'  as searches,
  counters->'usage'->>'calls'        as api_calls,
  counters->'usage'->>'inputTokens'  as input_tokens,
  counters->'usage'->>'outputTokens' as output_tokens,
  counters->'usage'->>'estimatedUsd' as estimated_usd_NOT_BILLED,
  counters->'usage'->'byModel'       as by_model
from lab_cycles
order by started_at desc;

-- ── 3. Every research stage, with what it cost ─────────────────────────────
-- One row per stage attempt. `estimatedusd` is arithmetic on a price list in
-- lib/investments/models.ts — it is not the Anthropic invoice.
select
  c.id as cycle_id, c.started_at,
  s->>'symbol'          as symbol,
  s->>'stage'           as stage,
  s->>'outcome'         as outcome,
  s->>'failureKind'     as failure,
  s->>'model'           as model,
  s->>'webSearches'     as searches,
  s->>'inputTokens'     as input_tokens,
  s->>'estimatedUsd'    as estimated_usd_NOT_BILLED,
  s->>'cacheHit'        as cache_hit,
  s->>'durationMs'      as duration_ms
from lab_cycles c
cross join lateral jsonb_array_elements(coalesce(c.summary->'stageLog', '[]'::jsonb)) s
order by c.started_at desc, (s->>'stageStartedAt');

-- ── 4. Successful research that is now on file (each cost one call) ────────
select 'fundamentals' as kind, symbol, exchange, fetched_at from inv_securities
union all
select 'qualitative',          symbol, exchange, fetched_at from lab_research
order by fetched_at desc;

-- ── 5. Market-regime assessments (one call each, cached 24h) ───────────────
select id, as_of, state, created_at from inv_market_regime order by created_at desc;

-- ── 6. Non-Lab consumers of the SAME API key ──────────────────────────────
-- The interactive Analyse button and the Opportunities scan bill to the same
-- key. If these have rows, the Lab is not the only thing that spent the credit.
select 'analyze button (up to 2 calls each)' as source, count(*), max(created_at) as latest
from inv_recommendations
union all
select 'opportunity scan (1 call each)', count(*), max(created_at) from inv_opportunities;

-- ── 7. What the Lab has to show for it ─────────────────────────────────────
select
  (select count(*) from lab_decisions) as decisions,
  (select count(*) from lab_trades)    as trades,
  (select count(*) from lab_positions where quantity > 0) as open_positions,
  (select count(*) from lab_nav_history) as nav_marks;
