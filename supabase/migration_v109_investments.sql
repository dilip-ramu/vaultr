-- v109 — Inex Investments (AI investment intelligence, Phase 1 foundation)
--
-- A new, SELF-CONTAINED module for Indian equities (NSE/BSE). Nothing else in
-- the app reads these tables, so it is purely additive: existing behaviour and
-- numbers are untouched. In particular this does NOT wire into net worth.
--
-- Design principles carried over from the rest of the app:
--   • RLS everywhere: a row is visible only to auth.uid() = user_id.
--   • Recommendations are an APPEND-ONLY journal — no UPDATE privilege is
--     granted, so history can never be silently rewritten (brief §23–25).
--   • "Unknown is not zero": prices/fundamentals are nullable; a missing value
--     is stored as NULL and surfaced as unknown, never faked as 0.
--   • Trading safety: inv_orders exists so execution can be built LATER behind
--     explicit approval. There is deliberately no automatic-execution path, and
--     inv_settings.execution_enabled defaults FALSE.
--
-- ── To revert ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS inv_orders, inv_settings, inv_market_regime,
--     inv_opportunities, inv_alerts, inv_recommendations, inv_securities,
--     inv_holdings CASCADE;
--   (and remove the /investments route + nav entry).

-- ── 1. Holdings — the investment ledger ─────────────────────────────────────
create table if not exists inv_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  symbol text not null,                          -- RELIANCE, TCS, IREDA …
  exchange text not null default 'NSE',          -- NSE | BSE
  company_name text,
  quantity numeric not null default 0,
  avg_cost numeric not null default 0,           -- per share, what you paid
  last_price numeric,                            -- fetched; NULL = unknown
  last_price_at timestamptz,
  sector text,
  market_cap_band text,                          -- large | mid | small | micro | unknown
  thesis text,                                   -- why you own it
  ai_rating text,                                -- last recommendation action (denormalised)
  thesis_status text not null default 'intact',  -- intact | watch | deteriorating | invalidated
  max_alloc_pct numeric,                         -- suggested portfolio ceiling
  source text not null default 'manual',         -- manual | assets | hdfc
  asset_id uuid references assets(id) on delete set null,  -- when seeded from Assets
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inv_holdings enable row level security;
drop policy if exists inv_holdings_all on inv_holdings;
create policy inv_holdings_all on inv_holdings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_holdings_user_idx on inv_holdings(user_id);
create unique index if not exists inv_holdings_user_symbol_idx
  on inv_holdings(user_id, symbol, exchange);

-- ── 2. Securities — cached reference + fundamentals snapshot per symbol ──────
create table if not exists inv_securities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  company_name text,
  sector text,
  market_cap_band text,
  fundamentals jsonb not null default '{}'::jsonb,  -- revenue, growth, margins, roe, roce, debt, cash, fcf …
  valuation jsonb not null default '{}'::jsonb,     -- pe, pb, ev_ebitda, ev_sales, peg …
  data_confidence int,                              -- 0–100; NULL = not yet researched
  sources jsonb not null default '[]'::jsonb,       -- [{title,url,tier}]
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol, exchange)
);
alter table inv_securities enable row level security;
drop policy if exists inv_securities_all on inv_securities;
create policy inv_securities_all on inv_securities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_securities_user_idx on inv_securities(user_id);

-- ── 3. Recommendations — IMMUTABLE decision journal (brief §23–25) ──────────
-- No UPDATE privilege is granted below: rows can be inserted and read (and
-- deleted to undo a mistake), but never edited. History stands.
create table if not exists inv_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  company_name text,
  as_of date not null default current_date,
  action text not null,                             -- STRONG_BUY|BUY|ACCUMULATE|HOLD|REDUCE|SELL|AVOID|INSUFFICIENT_DATA
  current_price numeric,
  entry_low numeric, entry_high numeric,
  fair_value_low numeric, fair_value_high numeric,
  bull_case text, base_case text, bear_case text,
  horizon text,                                     -- e.g. "2–3 years"
  why_now text,                                     -- or "GOOD COMPANY — WAIT FOR BETTER ENTRY"
  catalysts jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  invalidation jsonb not null default '[]'::jsonb,  -- what would change my mind
  data_confidence int,                              -- 0–100
  ai_confidence int,                                -- 0–100
  max_alloc_pct numeric,
  market_regime text,
  total_score numeric,
  score_breakdown jsonb not null default '{}'::jsonb,  -- transparent per-factor scores + weights
  portfolio_context text,                           -- why the portfolio changed the call (§9)
  sources jsonb not null default '[]'::jsonb,
  is_holding boolean not null default false,        -- was this analysed as an owned position?
  created_at timestamptz not null default now()
);
alter table inv_recommendations enable row level security;
drop policy if exists inv_recommendations_ins on inv_recommendations;
drop policy if exists inv_recommendations_sel on inv_recommendations;
drop policy if exists inv_recommendations_del on inv_recommendations;
create policy inv_recommendations_ins on inv_recommendations for insert
  with check (auth.uid() = user_id);
create policy inv_recommendations_sel on inv_recommendations for select
  using (auth.uid() = user_id);
create policy inv_recommendations_del on inv_recommendations for delete
  using (auth.uid() = user_id);
create index if not exists inv_recos_user_idx on inv_recommendations(user_id, created_at desc);
create index if not exists inv_recos_symbol_idx on inv_recommendations(user_id, symbol, exchange, created_at desc);

-- ── 4. Alerts ───────────────────────────────────────────────────────────────
create table if not exists inv_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  exchange text,
  kind text not null,                               -- thesis|buy_zone|sell_zone|concentration|macro|earnings|promoter|debt
  severity text not null default 'info',            -- info | warning | critical
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table inv_alerts enable row level security;
drop policy if exists inv_alerts_all on inv_alerts;
create policy inv_alerts_all on inv_alerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_alerts_user_idx on inv_alerts(user_id, created_at desc);

-- ── 5. Opportunities — discovery + watchlist (brief §21) ────────────────────
create table if not exists inv_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  company_name text,
  category text not null,                           -- strong_buy|buy|accumulate|watch|deep_value|growth|turnaround|special_situation|ipo|avoid
  thesis text,
  data_confidence int,
  score numeric,
  sources jsonb not null default '[]'::jsonb,
  is_watchlist boolean not null default false,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inv_opportunities enable row level security;
drop policy if exists inv_opportunities_all on inv_opportunities;
create policy inv_opportunities_all on inv_opportunities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_opps_user_idx on inv_opportunities(user_id, created_at desc);

-- ── 6. Market regime — append-only assessment history (brief §7) ────────────
create table if not exists inv_market_regime (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null default current_date,
  state text not null,                              -- risk_on | neutral | cautious | risk_off | crisis
  summary text,
  reasons jsonb not null default '[]'::jsonb,
  drivers jsonb not null default '{}'::jsonb,       -- valuation, liquidity, rates, inflation, inr, crude, fii_flows, volatility, geopolitics
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table inv_market_regime enable row level security;
drop policy if exists inv_market_regime_all on inv_market_regime;
create policy inv_market_regime_all on inv_market_regime for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_regime_user_idx on inv_market_regime(user_id, created_at desc);

-- ── 7. Settings — one row per user ──────────────────────────────────────────
create table if not exists inv_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_capital numeric,                          -- planned monthly investable (brief §20)
  risk_profile text default 'balanced',             -- conservative | balanced | aggressive
  score_weights jsonb not null default '{}'::jsonb, -- override default factor weights (§12)
  execution_enabled boolean not null default false, -- HARD OFF: no auto/broker execution in v1 (§4)
  hdfc jsonb not null default '{}'::jsonb,           -- encrypted token blob later; empty for now (§28)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inv_settings enable row level security;
drop policy if exists inv_settings_all on inv_settings;
create policy inv_settings_all on inv_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 8. Orders — SAFETY SCAFFOLD ONLY (brief §4) ─────────────────────────────
-- Present so a proposed-order → review → explicit approval → broker flow can be
-- built later. In Phase 1 nothing writes here and there is no broker submission
-- code anywhere in the app. A recommendation can NEVER become an order without
-- the user's explicit action.
create table if not exists inv_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  side text not null,                               -- buy | sell
  quantity numeric not null,
  order_type text not null default 'market',        -- market | limit
  limit_price numeric,
  status text not null default 'proposed',          -- proposed | approved | rejected | submitted | failed
  recommendation_id uuid references inv_recommendations(id) on delete set null,
  note text,
  proposed_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table inv_orders enable row level security;
drop policy if exists inv_orders_all on inv_orders;
create policy inv_orders_all on inv_orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inv_orders_user_idx on inv_orders(user_id, created_at desc);

-- ── Grants (RLS still governs rows; the role needs base table privileges) ────
grant select, insert, update, delete on public.inv_holdings      to authenticated;
grant select, insert, update, delete on public.inv_securities    to authenticated;
-- recommendations: NO UPDATE — append-only journal.
grant select, insert, delete         on public.inv_recommendations to authenticated;
grant select, insert, update, delete on public.inv_alerts        to authenticated;
grant select, insert, update, delete on public.inv_opportunities to authenticated;
grant select, insert, update, delete on public.inv_market_regime to authenticated;
grant select, insert, update, delete on public.inv_settings      to authenticated;
grant select, insert, update, delete on public.inv_orders        to authenticated;

grant all on public.inv_holdings        to service_role;
grant all on public.inv_securities      to service_role;
grant all on public.inv_recommendations to service_role;
grant all on public.inv_alerts          to service_role;
grant all on public.inv_opportunities   to service_role;
grant all on public.inv_market_regime   to service_role;
grant all on public.inv_settings        to service_role;
grant all on public.inv_orders          to service_role;
