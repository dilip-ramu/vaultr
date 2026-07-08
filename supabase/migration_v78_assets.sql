-- v78 — Assets (frames 25a–j)
-- Track appreciating/depreciating assets with per-category valuation,
-- market-linked pricing (gold/silver), and default rates per category/subcategory.
-- Self-contained: to revert, drop the three tables below (and remove the /assets
-- route + nav entry). Nothing else in the app depends on these.

-- ── Assets ────────────────────────────────────────────────────────────────
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  name text not null,
  category text not null,                       -- real_estate | gold | silver | electronics | (custom)
  subcategory text,                             -- land | building | jewellery | coins | computers | phones | ...
  valuation_type text not null default 'rate',  -- market | rate | depreciate | building
  purchase_date date,
  cost_total numeric not null default 0,        -- computed total cost (stored)
  details jsonb not null default '{}'::jsonb,    -- category-specific input fields
  -- market-linked (gold/silver)
  metal text,                                   -- gold | silver
  metal_purity text,                            -- 24K | 22K | null
  quantity_g numeric,                           -- grams held
  -- rate-linked
  override_rate_pct numeric,                    -- overrides category/subcategory default
  manual_value numeric,                         -- manually entered current value
  manual_value_date date,
  photo_url text,
  include_in_net_worth boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table assets enable row level security;
drop policy if exists assets_all on assets;
create policy assets_all on assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists assets_user_idx on assets(user_id);

-- ── Market rates (global reference data; written by the daily cron via service role) ──
create table if not exists market_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  metal text not null,                          -- gold | silver
  purity text,                                  -- 24K | 22K | null (silver)
  rate_per_gram numeric not null,
  source text,
  created_at timestamptz not null default now(),
  unique (rate_date, metal, purity)
);
alter table market_rates enable row level security;
drop policy if exists market_rates_read on market_rates;
create policy market_rates_read on market_rates for select
  using (auth.role() = 'authenticated');
create index if not exists market_rates_lookup_idx on market_rates(metal, purity, rate_date desc);

-- ── Per-category / per-subcategory default rates ──────────────────────────
create table if not exists asset_rate_defaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  subcategory text,                             -- null = category-level default
  kind text not null default 'appreciate',      -- appreciate | depreciate
  rate_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, subcategory)
);
alter table asset_rate_defaults enable row level security;
drop policy if exists asset_rate_defaults_all on asset_rate_defaults;
create policy asset_rate_defaults_all on asset_rate_defaults for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Table-level grants (RLS still governs rows; the role needs base access) ──
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.asset_rate_defaults to authenticated;
grant select on public.market_rates to authenticated;
