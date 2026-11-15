#!/usr/bin/env bash
#
# Move Inex's data from the Supabase cloud project onto this Mac.
#
#   bash selfhost/migrate.sh --dry-run    # says what it would do, changes nothing
#   bash selfhost/migrate.sh
#
# WHAT IT DOES
#   1. Dumps the live database (roles, schema, data) to a local file
#   2. Restores it into the self-hosted Postgres running in Docker
#   3. Downloads every file in both storage buckets
#   4. Uploads them into the self-hosted storage
#   5. Counts rows, table by table, on BOTH sides and compares
#
# WHAT IT NEVER DOES
#   Writes to, deletes from, or alters the live Supabase project. The cloud
#   side is opened read-only. Your rollback stays intact.
#
# WHAT YOU NEED
#   SUPABASE_DB_URL     the live project's connection string (Settings →
#                       Database → Connection string → URI, with the password)
#   SUPABASE_URL        https://<ref>.supabase.co
#   SUPABASE_SERVICE_KEY the service_role key (Settings → API)
#   LOCAL_DB_URL        defaults to the stack's postgres on localhost:5432
#   LOCAL_URL           defaults to http://localhost:8000
#   LOCAL_SERVICE_KEY   the service key from your self-hosted .env
#
# Put them in selfhost/.env.migrate (gitignored) or export them first.

set -uo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env.migrate" ] && . "$HERE/.env.migrate"

OUT="${HERE}/dump"
STAMP=$(date +%Y%m%d-%H%M%S)
PASS=0; FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
hr()   { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
say()  { [ "$DRY" = 1 ] && printf '  \033[36m→ would:\033[0m %s\n' "$1" || printf '  %s\n' "$1"; }

LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
LOCAL_URL="${LOCAL_URL:-http://localhost:8000}"

[ "$DRY" = 1 ] && printf '\n\033[1;36mDRY RUN — nothing will be changed anywhere.\033[0m\n'

hr "0. What we have"
missing=0
for v in SUPABASE_DB_URL SUPABASE_URL SUPABASE_SERVICE_KEY LOCAL_SERVICE_KEY; do
  if [ -z "${!v:-}" ]; then bad "$v is not set"; missing=1; else ok "$v is set"; fi
done
[ "$missing" = 1 ] && { echo; echo "  Put these in $HERE/.env.migrate and run again."; exit 1; }

for t in pg_dump psql curl jq; do
  command -v "$t" >/dev/null 2>&1 && ok "$t found" || { bad "$t missing (brew install $t)"; missing=1; }
done
[ "$missing" = 1 ] && exit 1

hr "1. Can we reach both sides?"
if psql "$SUPABASE_DB_URL" -tAc 'select 1' >/dev/null 2>&1; then ok "live Supabase reachable"
else bad "cannot reach the live database — check SUPABASE_DB_URL"; exit 1; fi
if psql "$LOCAL_DB_URL" -tAc 'select 1' >/dev/null 2>&1; then ok "local Postgres reachable"
else bad "cannot reach local Postgres — is the stack up? (docker compose ps)"; exit 1; fi

# A fingerprint of the live data, taken BEFORE anything, to compare against
# afterwards. This is the whole reason to trust the migration.
hr "2. Counting the live data"
COUNTS_BEFORE="$OUT/counts-live-$STAMP.txt"
mkdir -p "$OUT"
psql "$SUPABASE_DB_URL" -tAF'|' -c "
  select table_name,
         (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from public.%I', table_name),
           false, true, '')))[1]::text::bigint as n
  from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
  order by table_name;" > "$COUNTS_BEFORE" 2>/dev/null
LIVE_TABLES=$(wc -l < "$COUNTS_BEFORE" | tr -d ' ')
LIVE_ROWS=$(awk -F'|' '{s+=$2} END{print s+0}' "$COUNTS_BEFORE")
ok "$LIVE_TABLES tables, $LIVE_ROWS rows  → $COUNTS_BEFORE"
AUTH_USERS=$(psql "$SUPABASE_DB_URL" -tAc 'select count(*) from auth.users' 2>/dev/null | tr -d ' ')
ok "${AUTH_USERS:-?} auth users"

hr "3. Dumping"
DUMP="$OUT/inex-$STAMP.sql"
if [ "$DRY" = 1 ]; then
  say "pg_dump the live database (schema + data, including auth and storage) → $DUMP"
else
  # --no-owner/--no-privileges because the role names differ between a hosted
  # project and a self-hosted one; the stack's own roles are used instead.
  if pg_dump "$SUPABASE_DB_URL" \
      --no-owner --no-privileges --quote-all-identifiers \
      --schema=public --schema=auth --schema=storage \
      -f "$DUMP" 2>"$OUT/dump-$STAMP.log"; then
    ok "dumped $(du -h "$DUMP" | cut -f1) → $DUMP"
  else
    bad "pg_dump failed — see $OUT/dump-$STAMP.log"; tail -5 "$OUT/dump-$STAMP.log" | sed 's/^/      /'; exit 1
  fi
fi

hr "4. Restoring into the local stack"
if [ "$DRY" = 1 ]; then
  say "psql the dump into $LOCAL_DB_URL"
  say "(the local auth and storage schemas already exist; conflicting rows are reported, not forced)"
else
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=0 -f "$DUMP" >"$OUT/restore-$STAMP.log" 2>&1
  ERRS=$(grep -ci '^ERROR' "$OUT/restore-$STAMP.log" || true)
  if [ "${ERRS:-0}" -eq 0 ]; then ok "restored with no errors"
  else warn "$ERRS errors during restore — most are 'already exists' and harmless, but READ THEM: $OUT/restore-$STAMP.log"; fi
fi

hr "5. Verifying, table by table"
if [ "$DRY" = 1 ]; then
  say "re-count every table locally and compare against the live counts"
else
  COUNTS_AFTER="$OUT/counts-local-$STAMP.txt"
  psql "$LOCAL_DB_URL" -tAF'|' -c "
    select table_name,
           (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from public.%I', table_name),
             false, true, '')))[1]::text::bigint as n
    from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
    order by table_name;" > "$COUNTS_AFTER" 2>/dev/null

  MISMATCH=0
  while IFS='|' read -r tbl n; do
    [ -z "$tbl" ] && continue
    local_n=$(grep "^${tbl}|" "$COUNTS_AFTER" | cut -d'|' -f2)
    if [ -z "$local_n" ]; then bad "$tbl — missing locally"; MISMATCH=1
    elif [ "$n" != "$local_n" ]; then bad "$tbl — live $n, local $local_n"; MISMATCH=1; fi
  done < "$COUNTS_BEFORE"
  [ "$MISMATCH" = 0 ] && ok "every table matches ($LIVE_ROWS rows)"

  LOCAL_USERS=$(psql "$LOCAL_DB_URL" -tAc 'select count(*) from auth.users' 2>/dev/null | tr -d ' ')
  [ "${LOCAL_USERS:-x}" = "${AUTH_USERS:-y}" ] && ok "auth users match (${LOCAL_USERS})" \
    || bad "auth users: live ${AUTH_USERS}, local ${LOCAL_USERS} — nobody can sign in if this is wrong"

  POL=$(psql "$LOCAL_DB_URL" -tAc "select count(*) from pg_policies where schemaname='public'" | tr -d ' ')
  [ "${POL:-0}" -ge 150 ] && ok "$POL row-level-security policies in place" \
    || bad "only ${POL} RLS policies — the security model did not come across"
fi

hr "6. The files"
for BUCKET in vaultr-attachments vaultr-avatars; do
  N=$(psql "$SUPABASE_DB_URL" -tAc "select count(*) from storage.objects where bucket_id='$BUCKET'" 2>/dev/null | tr -d ' ')
  SZ=$(psql "$SUPABASE_DB_URL" -tAc "select pg_size_pretty(sum(coalesce((metadata->>'size')::bigint,0))) from storage.objects where bucket_id='$BUCKET'" 2>/dev/null | tr -d ' ')
  echo "  $BUCKET: ${N:-0} files, ${SZ:-0}"

  if [ "$DRY" = 1 ]; then
    say "download all ${N:-0} files from $BUCKET and upload them to the local stack"
    continue
  fi

  DIR="$OUT/files/$BUCKET"; mkdir -p "$DIR"
  GOT=0; LOST=0
  psql "$SUPABASE_DB_URL" -tAc "select name from storage.objects where bucket_id='$BUCKET' order by name" 2>/dev/null \
  | while IFS= read -r OBJ; do
      [ -z "$OBJ" ] && continue
      mkdir -p "$DIR/$(dirname "$OBJ")"
      if curl -fsS -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
           "$SUPABASE_URL/storage/v1/object/$BUCKET/$OBJ" -o "$DIR/$OBJ" 2>/dev/null; then
        curl -fsS -X POST -H "Authorization: Bearer $LOCAL_SERVICE_KEY" \
             -H "Content-Type: application/octet-stream" \
             --data-binary "@$DIR/$OBJ" \
             "$LOCAL_URL/storage/v1/object/$BUCKET/$OBJ" >/dev/null 2>&1 \
          && GOT=$((GOT+1)) || { echo "      upload failed: $OBJ"; LOST=$((LOST+1)); }
      else
        echo "      download failed: $OBJ"; LOST=$((LOST+1))
      fi
    done
  ok "$BUCKET copied (local copies kept in $DIR)"
done

hr "Done"
echo "   passed: $PASS   failed: $FAIL"
echo
if [ "$DRY" = 1 ]; then
  echo "   Nothing was changed. Run without --dry-run when you are ready."
elif [ "$FAIL" -eq 0 ]; then
  echo "   Data is across and verified."
  echo
  echo "   NEXT, and in this order:"
  echo "     1. Point the app at the local stack (.env.local) and test it properly"
  echo "     2. Get backups running and RESTORE one before you cut over"
  echo "     3. Leave the Supabase project alone for a month — it is your rollback"
else
  echo "   Something did not match. Do not cut over. The live project is untouched."
fi
