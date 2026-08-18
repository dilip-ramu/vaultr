-- v114 — Investment Lab: durable research stages
--
-- THE PROBLEM THIS SOLVES
--
-- A cycle could yield safely, but a single security's analysis still had to
-- finish inside one invocation. Production showed the failure exactly: the
-- fundamentals call succeeded and was cached, ~8 seconds of request budget
-- remained, the qualitative call was started anyway and died at 8000ms, and the
-- work was recorded as "Deferred (TIMEOUT)" — a technical failure written into
-- the investment journal as though it were a decision.
--
-- Two things were wrong. Research had no memory between the two halves, and an
-- execution timeout was being filed as investment reasoning.
--
-- WHAT THIS ADDS
--
--   1. A STAGE on each cycle step, so the system knows precisely what has
--      already succeeded for that security. Fundamentals done, qualitative
--      pending: the next invocation starts at qualitative and never re-runs
--      fundamentals.
--   2. Operational state on the step — attempts, last error, when. Retries and
--      timeouts belong here, NOT in lab_decisions.
--   3. lab_research: the qualitative half persisted the way fundamentals already
--      are in inv_securities, so a completed research call is never thrown away
--      because the clock ran out afterwards.
--
-- lab_decisions keeps its meaning: an entry there is an investment conclusion.
-- Its append-only trigger from v112 is untouched.
--
-- Run AFTER v113. Additive and idempotent; no data is modified.
--
-- ── To revert ────────────────────────────────────────────────────────────────
--   drop table if exists lab_research cascade;
--   alter table lab_cycle_steps drop column if exists stage, drop column if exists attempts,
--     drop column if exists last_error, drop column if exists last_error_at,
--     drop column if exists stage_updated_at;

-- ── 1. Where a security's research has got to ───────────────────────────────
alter table lab_cycle_steps add column if not exists stage text not null default 'fundamentals';
alter table lab_cycle_steps add column if not exists attempts int not null default 0;
alter table lab_cycle_steps add column if not exists last_error text;
alter table lab_cycle_steps add column if not exists last_error_at timestamptz;
alter table lab_cycle_steps add column if not exists stage_updated_at timestamptz;

comment on column lab_cycle_steps.stage is
  'fundamentals -> qualitative -> decision -> complete. The resume point for this security. A stage is only advanced once its work has been persisted.';
comment on column lab_cycle_steps.last_error is
  'Operational failure detail (timeout, rate limit, provider error). Deliberately kept OUT of lab_decisions: a technical failure is not an investment decision.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lab_cycle_steps_stage_chk') then
    alter table lab_cycle_steps
      add constraint lab_cycle_steps_stage_chk
      check (stage in ('fundamentals', 'qualitative', 'decision', 'complete'));
  end if;
end $$;

create index if not exists lab_cycle_steps_stage_idx on lab_cycle_steps(cycle_id, stage);

-- ── 2. The qualitative half, persisted ──────────────────────────────────────
-- Mirrors what inv_securities already does for fundamentals. Keyed by user and
-- security rather than by cycle, so a completed piece of research is reusable
-- and survives the cycle that produced it.
create table if not exists lab_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  company_name text,
  -- The full qualitative payload: scores, bull/base/bear, catalysts, risks,
  -- invalidation conditions, fair value and entry band, why-now.
  qualitative jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  ai_confidence int,
  model_version text,
  regime_at_research text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol, exchange)
);
alter table lab_research enable row level security;
drop policy if exists lab_research_all on lab_research;
create policy lab_research_all on lab_research for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_research_user_idx on lab_research(user_id, fetched_at desc);

comment on table lab_research is
  'Persisted qualitative/news research. Not a journal — it is a cache with a TTL, refreshed when stale. The permanent record of what the Lab concluded stays in lab_decisions.';

grant select, insert, update, delete on public.lab_research to authenticated;
grant all on public.lab_research to service_role;

-- ── 3. Discovered candidates must survive an invocation ─────────────────────
-- Discovery output already lives in lab_cycles.cursor. This index just makes the
-- resume lookup cheap as cycle history grows.
create index if not exists lab_cycles_user_status_idx on lab_cycles(user_id, status, started_at desc);
