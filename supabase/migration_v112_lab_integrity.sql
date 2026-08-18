-- v112 — Investment Lab: correctness & reliability pass
--
-- The Lab is meant to be a PERMANENT experiment. A wrong NAV row, a duplicated
-- trade or a dividend paid twice would contaminate it forever, so this migration
-- is about making the database itself refuse those outcomes rather than trusting
-- application code to be careful.
--
-- What it adds
--   1. Carried-forward prices on positions        → no fake drawdown when a quote fails
--   2. Data-quality columns on NAV history        → every row says how it was priced
--   3. A pinned benchmark baseline on the account → performance measured from a fixed start
--   4. lab_cycles + lab_cycle_steps               → resumable, idempotent decision cycles
--   5. step_id on trades and decisions (UNIQUE)   → a retry cannot execute twice
--   6. Immutability triggers                      → history cannot be edited, even by service_role
--
-- Run AFTER v111. Safe to re-run: every statement is idempotent.
--
-- ── To revert ────────────────────────────────────────────────────────────────
--   drop trigger if exists lab_trades_no_update on lab_trades;  (and the others)
--   drop function if exists lab_block_update() cascade;
--   drop function if exists lab_block_backdated_update() cascade;
--   drop table if exists lab_cycle_steps, lab_cycles cascade;
--   alter table lab_nav_history drop column if exists data_quality, ... ;

-- ── 1. Positions: remember the last valid price ─────────────────────────────
alter table lab_positions add column if not exists last_price numeric;
alter table lab_positions add column if not exists last_price_at timestamptz;
alter table lab_positions add column if not exists last_price_source text;

comment on column lab_positions.last_price is
  'Most recent VALID market price. Carried forward when a quote fetch fails so a provider outage cannot print a fictitious loss into NAV history.';

-- ── 2. NAV history: say how the number was produced ─────────────────────────
alter table lab_nav_history add column if not exists stale jsonb not null default '[]'::jsonb;
alter table lab_nav_history add column if not exists data_quality text not null default 'fresh';
alter table lab_nav_history add column if not exists fresh_count int not null default 0;
alter table lab_nav_history add column if not exists stale_count int not null default 0;
alter table lab_nav_history add column if not exists session_source text;
alter table lab_nav_history add column if not exists marked_at timestamptz;

comment on column lab_nav_history.data_quality is
  'fresh = every position priced today; stale = at least one carried-forward price. Rows that would be "incomplete" (a position that has never been priced) are NOT written at all.';
comment on column lab_nav_history.session_source is
  'index = the trading session date came from the benchmark index timestamp; calendar = derived from the IST calendar.';

-- ── 3. Accounts: pinned benchmark baseline + a pending state ────────────────
alter table lab_accounts add column if not exists benchmark_start jsonb;

comment on column lab_accounts.benchmark_start is
  'Benchmark levels captured ONCE at account creation: {nifty50_level, nifty500_level, as_of, captured_at, source}. Never re-derived from a later mark — otherwise a failed first fetch silently makes the benchmark read flat forever.';

do $$
begin
  -- A Lab with no baseline must not trade: it could not be measured.
  if not exists (
    select 1 from pg_constraint where conname = 'lab_accounts_status_chk'
  ) then
    alter table lab_accounts
      add constraint lab_accounts_status_chk
      check (status in ('pending_baseline', 'active', 'paused', 'closed'));
  end if;
end $$;

-- ── 4. Corporate actions: when they were processed ──────────────────────────
alter table lab_dividends add column if not exists processed_at timestamptz;
alter table lab_corporate_actions add column if not exists applied_at timestamptz;

-- ── 5. Cycles — durable, resumable decision runs ────────────────────────────
create table if not exists lab_cycles (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started',      -- started|in_progress|partial|completed|failed
  phase text not null default 'mark',          -- mark|holdings|discovery|finalize|done
  cursor jsonb not null default '{}'::jsonb,   -- frozen work queues + positions reached
  counters jsonb not null default '{}'::jsonb, -- analyses, actions, cache hits, deferrals
  trading_date date not null,
  model_version text not null default '1.0',
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint lab_cycles_status_chk check (status in ('started','in_progress','partial','completed','failed'))
);
alter table lab_cycles enable row level security;
drop policy if exists lab_cycles_all on lab_cycles;
create policy lab_cycles_all on lab_cycles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_cycles_lab_idx on lab_cycles(lab_id, started_at desc);
-- At most ONE open cycle per Lab: a double-click cannot fork the run.
create unique index if not exists lab_cycles_one_open
  on lab_cycles(lab_id) where status in ('started', 'in_progress');

-- ── 6. Cycle steps — the unit of idempotent work ────────────────────────────
create table if not exists lab_cycle_steps (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references lab_cycles(id) on delete cascade,
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_key text not null,                      -- e.g. 'holding:RELIANCE:NSE'
  kind text not null,                          -- holding | idea
  symbol text,
  exchange text,
  status text not null default 'claimed',      -- claimed|done|skipped|deferred|failed
  reason text,
  decision_id uuid,
  trade_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_cycle_steps_status_chk check (status in ('claimed','done','skipped','deferred','failed'))
);
alter table lab_cycle_steps enable row level security;
drop policy if exists lab_cycle_steps_all on lab_cycle_steps;
create policy lab_cycle_steps_all on lab_cycle_steps for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- THE idempotency guarantee: one row per unit of work per cycle.
create unique index if not exists lab_cycle_steps_unique on lab_cycle_steps(cycle_id, step_key);
create index if not exists lab_cycle_steps_cycle_idx on lab_cycle_steps(cycle_id, status);

-- ── 7. Tie trades and decisions to the step that produced them ──────────────
alter table lab_trades    add column if not exists cycle_id uuid;
alter table lab_trades    add column if not exists step_id  uuid;
alter table lab_decisions add column if not exists cycle_id uuid;
alter table lab_decisions add column if not exists step_id  uuid;

-- A retried request cannot write the same trade or decision twice.
create unique index if not exists lab_trades_step_unique
  on lab_trades(step_id) where step_id is not null;
create unique index if not exists lab_decisions_step_unique
  on lab_decisions(step_id) where step_id is not null;
create index if not exists lab_trades_cycle_idx    on lab_trades(cycle_id);
create index if not exists lab_decisions_cycle_idx on lab_decisions(cycle_id);

-- ── 8. Immutability, enforced by the database ───────────────────────────────
--
-- v110 granted `all` to service_role, so append-only was only ever a convention
-- in application code. Any future scheduler must run as service_role, so the
-- guarantee has to live below it. These triggers apply to EVERY role.

create or replace function lab_block_update() returns trigger
language plpgsql as $$
begin
  raise exception
    'ledger_immutable: % is append-only — historical rows cannot be edited (attempted UPDATE on id %)',
    TG_TABLE_NAME, OLD.id
    using hint = 'Record a new row describing the correction instead of rewriting the past.';
end $$;

drop trigger if exists lab_trades_no_update on lab_trades;
create trigger lab_trades_no_update before update on lab_trades
  for each row execute function lab_block_update();

drop trigger if exists lab_decisions_no_update on lab_decisions;
create trigger lab_decisions_no_update before update on lab_decisions
  for each row execute function lab_block_update();

drop trigger if exists lab_dividends_no_update on lab_dividends;
create trigger lab_dividends_no_update before update on lab_dividends
  for each row execute function lab_block_update();

drop trigger if exists lab_corporate_actions_no_update on lab_corporate_actions;
create trigger lab_corporate_actions_no_update before update on lab_corporate_actions
  for each row execute function lab_block_update();

-- NAV and benchmark rows ARE upserted — re-marking the CURRENT session is normal
-- and idempotent. Rewriting a settled past session is not. The window allows for
-- a weekend/holiday roll-back (a Saturday run marks Friday's session).
create or replace function lab_block_backdated_update() returns trigger
language plpgsql as $$
begin
  if OLD.as_of < ((now() at time zone 'Asia/Kolkata')::date - 4) then
    raise exception
      'ledger_immutable: % row for % is settled history and cannot be rewritten',
      TG_TABLE_NAME, OLD.as_of
      using hint = 'Only the current trading session may be re-marked.';
  end if;
  return NEW;
end $$;

drop trigger if exists lab_nav_no_backdated_update on lab_nav_history;
create trigger lab_nav_no_backdated_update before update on lab_nav_history
  for each row execute function lab_block_backdated_update();

drop trigger if exists lab_benchmarks_no_backdated_update on lab_benchmarks;
create trigger lab_benchmarks_no_backdated_update before update on lab_benchmarks
  for each row execute function lab_block_backdated_update();

-- NOTE: the UPDATE privilege is deliberately NOT revoked on lab_dividends /
-- lab_corporate_actions. PostgREST implements upsert-with-ignore-duplicates as
-- INSERT ... ON CONFLICT DO NOTHING, and revoking UPDATE risks the client
-- refusing the request outright — which would stop dividends being recorded at
-- all. The triggers above already make the guarantee absolute for every role,
-- which is the part that actually matters.

-- ── 9. Grants for the new tables ────────────────────────────────────────────
grant select, insert, update, delete on public.lab_cycles      to authenticated;
grant select, insert, update, delete on public.lab_cycle_steps to authenticated;
grant all on public.lab_cycles      to service_role;
grant all on public.lab_cycle_steps to service_role;
