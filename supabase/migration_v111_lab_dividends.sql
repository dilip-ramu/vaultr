-- v111 — Investment Lab: dividends + corporate actions (total-return accounting)
--
-- A stock's return is price change + dividends + corporate actions. This adds:
--   • lab_dividends — every dividend the Lab receives, crediting virtual cash.
--   • lab_corporate_actions — splits/bonus (applied) and everything else (FLAGGED,
--     never silently miscomputed).
--   • lab_nav_history.dividends_cum — cumulative net dividend income, so total vs
--     price return can be separated deterministically.
-- Run AFTER v110.

alter table lab_nav_history add column if not exists dividends_cum numeric not null default 0;

-- ── Dividends received (credited to cash on payment) ────────────────────────
create table if not exists lab_dividends (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  isin text,
  dividend_per_share numeric not null,
  shares_on_record numeric not null,
  gross_dividend numeric not null,
  tax_pct numeric not null default 0,              -- assumed withholding (documented)
  net_dividend numeric not null,                   -- credited to virtual cash
  ex_date date,
  record_date date,
  payment_date date,
  kind text not null default 'dividend',           -- dividend | interim | final | special
  source jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (lab_id, symbol, exchange, ex_date, dividend_per_share)
);
alter table lab_dividends enable row level security;
drop policy if exists lab_dividends_all on lab_dividends;
create policy lab_dividends_all on lab_dividends for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_dividends_lab_idx on lab_dividends(lab_id, payment_date desc);

-- ── Corporate actions (splits/bonus applied; others flagged) ────────────────
create table if not exists lab_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references lab_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  exchange text not null default 'NSE',
  type text not null,                              -- split | bonus | rights | buyback | merger | demerger | other
  ratio numeric,                                   -- split: new-per-old; bonus: bonus-per-held
  ex_date date,
  details text,
  status text not null default 'applied',          -- applied | flagged | ignored
  source jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (lab_id, symbol, exchange, type, ex_date)
);
alter table lab_corporate_actions enable row level security;
drop policy if exists lab_corporate_actions_all on lab_corporate_actions;
create policy lab_corporate_actions_all on lab_corporate_actions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists lab_ca_lab_idx on lab_corporate_actions(lab_id, ex_date desc);

grant select, insert, update, delete on public.lab_dividends         to authenticated;
grant select, insert, update, delete on public.lab_corporate_actions to authenticated;
grant all on public.lab_dividends         to service_role;
grant all on public.lab_corporate_actions to service_role;
