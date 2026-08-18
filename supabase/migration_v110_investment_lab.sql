-- v110 — Inex Investment Lab (Phase 2)
--
-- A PERMANENT, AUTONOMOUS PAPER PORTFOLIO. ₹10,00,000 of VIRTUAL capital managed
-- by the Phase-1 intelligence, to test whether Inex can beat a passive Indian
-- benchmark over time. Completely separate from the real portfolio (inv_*):
-- these tables never touch real holdings, and NOTHING here or downstream places
-- a broker order — the Lab is virtual by construction.
--
-- Integrity principles (brief §5, §6, §11, §14):
--   • lab_trades and lab_decisions are APPEND-ONLY — no UPDATE privilege granted,
--     so history can never be rewritten and no future fact can alter a past
--     record. Each decision stores a `snapshot` of its point-in-time inputs.
--   • Every decision/trade stamps the model_version that produced it.
--   • NAV and benchmark marks are per-day snapshots (upsert by day = re-mark
--     today, never edit the past).
--
-- ── To revert ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS lab_reviews, lab_learnings, lab_postmortems,
--     lab_benchmarks, lab_nav_history, lab_trades, lab_decisions, lab_positions,
--     lab_accounts CASCADE;

-- ── 1. The virtual account ──────────────────────────────────────────────────
create table if not exists lab_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Inex Investment Lab',
  starting_capital numeric not null default 1000000,
  start_date date not null default current_date,
  cash numeric not null default 1000000,          -- uninvested virtual cash
  model_version text not null default '1.0',
  status text not null default 'active',           -- active | paused | closed
  constraints jsonb not null default '{
    "max_single_pct": 10, "max_sector_pct": 25,
    "min_data_confidence": 45, "min_price": 20,
    "no_leverage": true, "no_shorting": true, "no_derivatives": true,
    "max_actions_per_cycle": 6
  }'::jsonb,
  cost_model jsonb not null default '{
    "brokerage_pct": 0, "brokerage_flat": 0,
    "stt_pct": 0.001, "exchange_pct": 0.0000297, "sebi_pct": 0.000001,
    "stamp_pct_buy": 0.00015, "gst_pct": 0.18, "slippage_pct": 0.001
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lab_accounts enable row level security;
drop policy if exists lab_accounts_all on lab_accounts;
create policy lab_accounts_all on lab_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_accounts_user_idx on lab_accounts(user_id);

-- ── 2. Open positions (aggregated lot per symbol) ───────────────────────────
create table if not exists lab_positions (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  company_name text,
  quantity numeric not null default 0,
  cost_basis numeric not null default 0,          -- total INR paid incl. buy costs
  sector text,
  market_cap_band text,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, symbol, exchange)
);
alter table lab_positions enable row level security;
drop policy if exists lab_positions_all on lab_positions;
create policy lab_positions_all on lab_positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_positions_lab_idx on lab_positions(lab_id);

-- ── 3. Trades — IMMUTABLE executed simulations ──────────────────────────────
create table if not exists lab_trades (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  side text not null,                              -- buy | sell
  symbol text not null,
  exchange text not null default 'NSE',
  quantity numeric not null,
  price numeric not null,                          -- execution price AFTER slippage
  gross_amount numeric not null,                   -- price * qty
  costs_total numeric not null default 0,
  costs_breakdown jsonb not null default '{}'::jsonb,
  cash_after numeric not null,
  realized_pnl numeric,                            -- sells only
  model_version text not null default '1.0',
  decision_id uuid,
  created_at timestamptz not null default now()
);
alter table lab_trades enable row level security;
drop policy if exists lab_trades_ins on lab_trades;
drop policy if exists lab_trades_sel on lab_trades;
drop policy if exists lab_trades_del on lab_trades;
create policy lab_trades_ins on lab_trades for insert with check (auth.uid() = user_id);
create policy lab_trades_sel on lab_trades for select using (auth.uid() = user_id);
create policy lab_trades_del on lab_trades for delete using (auth.uid() = user_id);
create index if not exists lab_trades_lab_idx on lab_trades(lab_id, ts desc);

-- ── 4. Decisions — IMMUTABLE rich journal (§5, §11) ─────────────────────────
create table if not exists lab_decisions (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  kind text not null,                              -- buy|sell|reduce|add|hold|exit|rebalance|cash
  symbol text,
  exchange text,
  company_name text,
  action text,                                     -- the Phase-1 RecAction, when applicable
  quantity numeric,
  price numeric,
  capital_deployed numeric,
  portfolio_weight numeric,
  reason text,
  thesis text,
  bull_case text, base_case text, bear_case text,
  horizon text,
  fair_value_low numeric, fair_value_high numeric,
  entry_low numeric, entry_high numeric,
  risks jsonb not null default '[]'::jsonb,
  invalidation jsonb not null default '[]'::jsonb,
  ai_confidence int,
  data_confidence int,
  market_regime text,
  macro jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  -- Sell/close specifics
  original_thesis text,
  what_changed text,
  thesis_invalidated boolean,
  realized_pnl numeric,
  -- No-hindsight: the exact inputs available at decision time.
  snapshot jsonb not null default '{}'::jsonb,
  model_version text not null default '1.0',
  created_at timestamptz not null default now()
);
alter table lab_decisions enable row level security;
drop policy if exists lab_decisions_ins on lab_decisions;
drop policy if exists lab_decisions_sel on lab_decisions;
drop policy if exists lab_decisions_del on lab_decisions;
create policy lab_decisions_ins on lab_decisions for insert with check (auth.uid() = user_id);
create policy lab_decisions_sel on lab_decisions for select using (auth.uid() = user_id);
create policy lab_decisions_del on lab_decisions for delete using (auth.uid() = user_id);
create index if not exists lab_decisions_lab_idx on lab_decisions(lab_id, ts desc);
create index if not exists lab_decisions_symbol_idx on lab_decisions(lab_id, symbol, ts desc);

-- ── 5. Daily NAV history (deterministic marks) ──────────────────────────────
create table if not exists lab_nav_history (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null default current_date,
  cash numeric not null,
  positions_value numeric not null,
  total_value numeric not null,
  invested numeric not null,
  unrealized_pnl numeric not null,
  realized_pnl_cum numeric not null default 0,
  holdings_count int not null default 0,
  peak numeric,
  drawdown_pct numeric,
  unpriced jsonb not null default '[]'::jsonb,     -- symbols we couldn't price (excluded, not zeroed)
  created_at timestamptz not null default now(),
  unique (lab_id, as_of)
);
alter table lab_nav_history enable row level security;
drop policy if exists lab_nav_all on lab_nav_history;
create policy lab_nav_all on lab_nav_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_nav_lab_idx on lab_nav_history(lab_id, as_of desc);

-- ── 6. Daily benchmark marks (Nifty 50 + Nifty 500) ─────────────────────────
create table if not exists lab_benchmarks (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null default current_date,
  nifty50_level numeric,
  nifty500_level numeric,
  nifty50_value numeric,                           -- ₹10L grown from start level (price return)
  nifty500_value numeric,
  created_at timestamptz not null default now(),
  unique (lab_id, as_of)
);
alter table lab_benchmarks enable row level security;
drop policy if exists lab_benchmarks_all on lab_benchmarks;
create policy lab_benchmarks_all on lab_benchmarks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_benchmarks_lab_idx on lab_benchmarks(lab_id, as_of desc);

-- ── 7. Post-mortems on closed positions (§12) ───────────────────────────────
create table if not exists lab_postmortems (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text,
  closed_at timestamptz not null default now(),
  original_thesis text,
  outcome text,
  classification text,                             -- see brief §12 categories
  analysis text,
  realized_pnl numeric,
  holding_days int,
  model_version text,
  created_at timestamptz not null default now()
);
alter table lab_postmortems enable row level security;
drop policy if exists lab_postmortems_all on lab_postmortems;
create policy lab_postmortems_all on lab_postmortems for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_postmortems_lab_idx on lab_postmortems(lab_id, closed_at desc);

-- ── 8. Learning observations (§13) — accumulate evidence, don't auto-rewrite ─
create table if not exists lab_learnings (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  observation text not null,
  category text,
  evidence jsonb not null default '{}'::jsonb,      -- {sample_size, stats...}
  proposed_change text,
  status text not null default 'observation',       -- observation | proposed_change | adopted | rejected
  model_version text,
  created_at timestamptz not null default now()
);
alter table lab_learnings enable row level security;
drop policy if exists lab_learnings_all on lab_learnings;
create policy lab_learnings_all on lab_learnings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_learnings_lab_idx on lab_learnings(lab_id, ts desc);

-- ── 9. Periodic reviews (§15–18) ────────────────────────────────────────────
create table if not exists lab_reviews (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,                            -- monthly | 3m | 6m | 12m | 24m | 36m
  as_of date not null default current_date,
  metrics jsonb not null default '{}'::jsonb,
  narrative text,
  created_at timestamptz not null default now()
);
alter table lab_reviews enable row level security;
drop policy if exists lab_reviews_all on lab_reviews;
create policy lab_reviews_all on lab_reviews for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_reviews_lab_idx on lab_reviews(lab_id, created_at desc);

-- ── Grants (RLS governs rows; role needs base privileges) ───────────────────
grant select, insert, update, delete on public.lab_accounts     to authenticated;
grant select, insert, update, delete on public.lab_positions    to authenticated;
-- trades + decisions: NO UPDATE — append-only audit trail.
grant select, insert, delete         on public.lab_trades       to authenticated;
grant select, insert, delete         on public.lab_decisions    to authenticated;
grant select, insert, update, delete on public.lab_nav_history  to authenticated;
grant select, insert, update, delete on public.lab_benchmarks   to authenticated;
grant select, insert, update, delete on public.lab_postmortems  to authenticated;
grant select, insert, update, delete on public.lab_learnings    to authenticated;
grant select, insert, update, delete on public.lab_reviews      to authenticated;

grant all on public.lab_accounts    to service_role;
grant all on public.lab_positions   to service_role;
grant all on public.lab_trades      to service_role;
grant all on public.lab_decisions   to service_role;
grant all on public.lab_nav_history to service_role;
grant all on public.lab_benchmarks  to service_role;
grant all on public.lab_postmortems to service_role;
grant all on public.lab_learnings   to service_role;
grant all on public.lab_reviews     to service_role;
