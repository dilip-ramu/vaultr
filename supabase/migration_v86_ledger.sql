-- v86 — Persisted general ledger (double-entry audit trail)
-- Auto-generated from the existing transactions by an idempotent sync (see
-- lib/books/sync.ts) — NO triggers, NO changes to any existing table or write
-- path, so nothing existing can break. One journal entry per transaction (plus
-- one per opening balance), each with balanced debit/credit lines, kept in sync
-- automatically. To revert: drop these two tables — the app is unaffected.

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                       -- 'transaction' | 'opening'
  source_txn_id uuid,                        -- transactions.id (null for opening)
  account_ref uuid,                          -- accounts.id (opening entries only)
  date date not null,
  memo text,
  created_at timestamptz not null default now()
);
alter table journal_entries enable row level security;
drop policy if exists journal_entries_all on journal_entries;
create policy journal_entries_all on journal_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists journal_entries_user_idx on journal_entries(user_id);
-- one entry per source, so the sync can upsert cleanly
create unique index if not exists journal_entries_txn_uq on journal_entries(user_id, source_txn_id) where source_txn_id is not null;
create unique index if not exists journal_entries_open_uq on journal_entries(user_id, account_ref) where kind = 'opening';

create table if not exists journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_key text not null,                 -- acct:<id> · cat:<id> · equity:opening · cat:uncat-*
  debit  numeric not null default 0,
  credit numeric not null default 0
);
alter table journal_lines enable row level security;
drop policy if exists journal_lines_all on journal_lines;
create policy journal_lines_all on journal_lines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists journal_lines_entry_idx on journal_lines(entry_id);

grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update, delete on public.journal_lines to authenticated;
