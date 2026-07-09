-- v81 — Asset sold status & realised profit
-- Any asset (all categories) can be marked "sold" with a selling price and date.
-- Realised profit = sold_price − cost_total, surfaced per-line and as a grand
-- total in the UI. Sold assets drop out of net worth (no longer held).
-- Self-contained: to revert, drop the three columns below.

alter table assets add column if not exists status     text not null default 'held';  -- held | sold
alter table assets add column if not exists sold_price  numeric;
alter table assets add column if not exists sold_date    date;

-- Existing rows inherit the default 'held' automatically.
