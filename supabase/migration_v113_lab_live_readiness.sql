-- v113 — Investment Lab: live-cycle readiness
--
-- Deploy #4. Three things the database should guarantee before real capital
-- (even virtual capital) starts accumulating a permanent history:
--
--   1. ONE Lab per user. Initialisation is idempotent in application code, but
--      two fast clicks could still race past the check. A partial unique index
--      makes a second live Lab impossible rather than unlikely.
--   2. The experiment's TERMS cannot change. Starting capital, start date and
--      the pinned benchmark baseline are fixed for the life of the Lab — you
--      cannot top up ₹10L, restart the clock, or re-pin the benchmark to a
--      friendlier level after the fact.
--   3. A schema health check the deployed app can actually call, so migration
--      state can be verified from the running application instead of taken on
--      trust.
--
-- Run AFTER v112. Idempotent and additive: no data is modified.
--
-- ── Pre-flight (must return 0 rows before this runs) ─────────────────────────
--   select user_id, count(*) from lab_accounts
--    where status in ('active','pending_baseline') group by user_id having count(*) > 1;
--
-- ── To revert ────────────────────────────────────────────────────────────────
--   drop trigger if exists lab_accounts_protect on lab_accounts;
--   drop function if exists lab_protect_account();
--   drop function if exists lab_schema_health();
--   drop index if exists lab_accounts_one_live_per_user;

-- ── 1. Exactly one live Lab per user ────────────────────────────────────────
create unique index if not exists lab_accounts_one_live_per_user
  on lab_accounts(user_id) where status in ('active', 'pending_baseline');

comment on index lab_accounts_one_live_per_user is
  'Initialisation is idempotent by construction: a second live Lab cannot be created, so repeating "create" can only ever return the existing experiment.';

-- ── 2. The terms of the experiment are fixed ────────────────────────────────
create or replace function lab_protect_account() returns trigger
language plpgsql as $$
begin
  if OLD.benchmark_start is not null
     and NEW.benchmark_start is distinct from OLD.benchmark_start then
    raise exception
      'lab_baseline_immutable: the benchmark baseline was pinned at % and cannot be replaced',
      OLD.benchmark_start ->> 'as_of'
      using hint = 'Re-pinning the baseline would silently rewrite every past performance comparison.';
  end if;

  if NEW.starting_capital is distinct from OLD.starting_capital then
    raise exception
      'lab_capital_immutable: starting capital is fixed at % for the life of the experiment',
      OLD.starting_capital
      using hint = 'Adding capital later would make every historical return figure wrong.';
  end if;

  if NEW.start_date is distinct from OLD.start_date then
    raise exception 'lab_start_immutable: the start date is fixed for the life of the experiment';
  end if;

  return NEW;
end $$;

drop trigger if exists lab_accounts_protect on lab_accounts;
create trigger lab_accounts_protect before update on lab_accounts
  for each row execute function lab_protect_account();

-- ── 3. Schema health, callable from the app ─────────────────────────────────
-- SECURITY DEFINER so an ordinary signed-in user can read catalog metadata,
-- but it returns ONLY names — no row data, no user data, nothing writable.
create or replace function lab_schema_health() returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(table_name order by table_name)
        from information_schema.tables
       where table_schema = 'public' and table_name like 'lab\_%'
    ), '[]'::jsonb),
    'triggers', coalesce((
      select jsonb_agg(t.tgname order by t.tgname)
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname = 'public' and c.relname like 'lab\_%'
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(indexname order by indexname)
        from pg_indexes
       where schemaname = 'public' and indexname like 'lab\_%'
    ), '[]'::jsonb),
    'nav_columns', coalesce((
      select jsonb_agg(column_name order by column_name)
        from information_schema.columns
       where table_schema = 'public' and table_name = 'lab_nav_history'
    ), '[]'::jsonb),
    'account_columns', coalesce((
      select jsonb_agg(column_name order by column_name)
        from information_schema.columns
       where table_schema = 'public' and table_name = 'lab_accounts'
    ), '[]'::jsonb)
  );
$$;

revoke all on function lab_schema_health() from public;
grant execute on function lab_schema_health() to authenticated;
grant execute on function lab_schema_health() to service_role;

-- ── 4. Index the lookup the dashboard does on every load ────────────────────
create index if not exists lab_decisions_kind_idx on lab_decisions(lab_id, kind, ts desc);
