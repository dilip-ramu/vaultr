# Moving Inex onto the Mac mini

Everything runs on the mini: the app, Postgres, auth, storage. No Supabase
subscription, no Vercel, nothing leaving the house except outbound calls to
Brevo, Anthropic and the market-data endpoints.

The Supabase *software* stays — it is open source, and it is what provides
`auth.uid()`, which all 181 row-level-security policies are built on. What
goes away is the account and the bill.

---

## Order of work

Each step is a gate. If one fails, stop there — the cost of stopping is small
and the cost of carrying on with a broken foundation is not.

### 0 · Two answers before anything

**Domain or `ts.net`?** Decide now. Chit members hold permanent portal links
with the hostname inside them. Changing it later means re-sending a link to
every member, so you want to do that once. A domain is about ₹900/year; a free
Tailscale Funnel address looks like `inex.tailnet-7f3a.ts.net`.

**Database size.** Not needed for the migration, but worth knowing:

```sql
select pg_size_pretty(pg_database_size(current_database()));
```

### 1 · Prove the stack runs — `check-mac-mini.sh`

```bash
bash selfhost/check-mac-mini.sh
```

One hour. Boots a throwaway Supabase stack, checks the parts Inex cannot work
without, deletes it again. Touches nothing of yours.

**Stop if this fails.** Supabase does not document Apple Silicon support. If
`auth.uid()` or Storage will not come up, the plan ends here having cost an
hour.

### 2 · Prepare the machine (yours to do)

- Energy Saver: never sleep, start after power failure, auto-login
- Docker Desktop installed, set to open at login
- iCloud: signed in, **"Optimise Mac Storage" OFF**, every Drive folder
  deselected except the one Inex will write to
- UPS plugged in — the cheapest reliability you will ever buy
- An external disk for backups that is **not** synced to iCloud

### 3 · Move the data — `migrate.sh`

```bash
bash selfhost/migrate.sh --dry-run    # says what it would do, changes nothing
bash selfhost/migrate.sh
```

Dumps the live database, restores it locally, moves both storage buckets, then
**verifies row counts table by table**. Pick a quiet week — not month-end, not
near an auction or a payroll run.

### 4 · Backups working, and restored once

Before go-live, not after. Nightly `pg_dump` plus the attachments folder, to
the external disk and to somewhere off the premises. Then restore it into a
scratch database and confirm the row counts.

An untested backup is not a backup, and this holds chit books your partners
rely on.

### 5 · Go live

Point the hostname at the mini. Run both systems side by side for a few days.
Cut over. Re-send portal links to chit members.

**Keep the Supabase project alive for a month.** It is the rollback, and the
moment it starts looking redundant is exactly when you would want it.

### 6 · Then the files

With the app on the mini it can write straight into
`~/Library/Mobile Documents/com~apple~CloudDocs/Inex/` — no browser, no
permission prompt, no button needed for the automatic cases:

- an attachment uploaded to a transaction is filed as it arrives
- an invoice or quotation is filed as it is created
- a monthly button catches reports and anything created elsewhere

---

## What you are taking on

Worth writing down plainly, because it does not go away:

- **The mini is a single point of failure.** A power cut takes down the member
  portal and the auction room, not just your own access.
- **Backups are yours now.** Supabase's daily backups disappear with the
  subscription.
- **Upgrades can break.** Supabase publishes tested stacks roughly monthly;
  pinning your own image versions is explicitly not guaranteed to work.
- **iCloud is not a backup.** Deleting a file on your phone deletes it on the
  mini. The real backup is the one that does not sync.

## What does not change

- Brevo for email, Anthropic for the investment work, the market-data feeds —
  all outbound, all unaffected
- The application code, apart from environment variables
- All 181 RLS policies, 23 functions, 18 triggers and 4 views — they are plain
  Postgres and move as-is
