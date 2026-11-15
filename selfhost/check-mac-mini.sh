#!/usr/bin/env bash
#
# Can this Mac run Inex's database?
#
# Run this ON THE MAC MINI, before migrating anything. It boots a throwaway
# Supabase stack, proves the parts Inex actually depends on, and deletes it
# again. Nothing in your live Supabase project is touched and no Inex data is
# read or written.
#
#   git clone <your repo> && cd Vaultr
#   bash selfhost/check-mac-mini.sh
#
# Takes about ten minutes, most of it downloading images.
#
# WHY THIS EXISTS: Supabase's own docs do not say whether the stack supports
# Apple Silicon, and there is a known macOS problem where Storage fails on a
# bind mount. Those are the two things that would sink the whole plan, and they
# are cheap to find out now rather than halfway through a migration.

set -uo pipefail

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
hr()   { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

WORK="${TMPDIR:-/tmp}/inex-selfhost-check"
cleanup() {
  if [ -d "$WORK/supabase/docker" ]; then
    hr "Cleaning up"
    (cd "$WORK/supabase/docker" && docker compose down -v >/dev/null 2>&1)
    echo "   throwaway stack removed"
  fi
}
trap cleanup EXIT

hr "1. The machine"
ARCH=$(uname -m)
[ "$ARCH" = "arm64" ] && ok "Apple Silicon ($ARCH)" || warn "Architecture is $ARCH, not arm64 — fine, but not what this was written for"

RAM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 ))
if   [ "$RAM_GB" -ge 16 ]; then ok "${RAM_GB} GB RAM (comfortable)"
elif [ "$RAM_GB" -ge 8 ];  then ok "${RAM_GB} GB RAM (meets the recommended 8 GB)"
elif [ "$RAM_GB" -ge 4 ];  then warn "${RAM_GB} GB RAM — above the 4 GB minimum but tight with the app running too"
else bad "${RAM_GB} GB RAM — below Supabase's 4 GB minimum"; fi

FREE_GB=$(df -g / 2>/dev/null | awk 'NR==2{print $4}')
if [ "${FREE_GB:-0}" -ge 80 ]; then ok "${FREE_GB} GB free disk"
elif [ "${FREE_GB:-0}" -ge 40 ]; then warn "${FREE_GB} GB free — meets the 40 GB minimum, leaves little room to grow"
else bad "${FREE_GB:-?} GB free — Supabase wants 40 GB minimum"; fi

hr "2. Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker found ($(docker --version | cut -d' ' -f3 | tr -d ,))"
else
  bad "docker not installed — install Docker Desktop for Mac first"; echo; exit 1
fi
if docker info >/dev/null 2>&1; then ok "Docker daemon is running"
else bad "Docker is installed but not running — start Docker Desktop"; echo; exit 1; fi
docker compose version >/dev/null 2>&1 && ok "docker compose available" || { bad "docker compose missing"; exit 1; }

hr "3. Fetching the Supabase stack"
rm -rf "$WORK"; mkdir -p "$WORK"
if git clone --depth 1 https://github.com/supabase/supabase "$WORK/supabase" >/dev/null 2>&1; then
  ok "cloned supabase/supabase"
else
  bad "could not clone supabase/supabase — check the network"; exit 1
fi
cd "$WORK/supabase/docker" || exit 1
cp .env.example .env
ok "config prepared (throwaway secrets — these are NOT for production)"

hr "4. Booting it (this is the slow part)"
if docker compose up -d >/tmp/inex-selfhost-up.log 2>&1; then
  ok "stack started"
else
  bad "stack failed to start — see /tmp/inex-selfhost-up.log"
  tail -20 /tmp/inex-selfhost-up.log | sed 's/^/      /'
  exit 1
fi

printf '   waiting for Postgres'
READY=0
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then READY=1; break; fi
  printf '.'; sleep 3
done
echo
[ "$READY" = 1 ] && ok "Postgres accepting connections" || { bad "Postgres never came up"; exit 1; }

hr "5. The parts Inex actually depends on"
q() { docker compose exec -T db psql -U postgres -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

[ "$(q "select count(*) from pg_namespace where nspname='auth'")" = "1" ] \
  && ok "auth schema present" || bad "auth schema missing — RLS would not work"

[ "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname='uid'")" = "1" ] \
  && ok "auth.uid() exists — all 181 RLS policies depend on this" \
  || bad "auth.uid() missing — the entire security model would need rewriting"

[ "$(q "select count(*) from pg_namespace where nspname='storage'")" = "1" ] \
  && ok "storage schema present (attachments, avatars)" || bad "storage schema missing"

[ "$(q "select count(*) from pg_extension where extname='pgcrypto'")" = "1" ] \
  && ok "pgcrypto (gen_random_uuid, used by every table)" || bad "pgcrypto missing"

# RLS end to end, which is the thing that matters most.
q "create table if not exists _probe(id uuid primary key default gen_random_uuid(), user_id uuid);
   alter table _probe enable row level security;
   drop policy if exists _probe_p on _probe;
   create policy _probe_p on _probe for all using (auth.uid() = user_id);" >/dev/null
[ "$(q "select count(*) from pg_policies where tablename='_probe'")" = "1" ] \
  && ok "created a table with an auth.uid() RLS policy — this is the whole question" \
  || bad "could not create an auth.uid() policy"
q "drop table if exists _probe" >/dev/null

hr "6. The services"
check_http() {
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" 2>/dev/null)
  # Any answer at all means the service is listening; 401 from the gateway is
  # expected without a key and is a pass.
  [ -n "$code" ] && [ "$code" != "000" ]
}
check_http "http://localhost:8000/rest/v1/" && ok "PostgREST answering (the API the app talks to)" || bad "PostgREST not answering on :8000"
check_http "http://localhost:8000/auth/v1/health" && ok "Auth (GoTrue) answering" || bad "Auth not answering"
check_http "http://localhost:8000/storage/v1/version" && ok "Storage answering" \
  || warn "Storage not answering — on macOS this is usually the bind-mount problem; switch it to a named volume in docker-compose.yml"

UNHEALTHY=$(docker compose ps --format '{{.Service}} {{.Status}}' 2>/dev/null | grep -ci 'unhealthy\|exited' || true)
[ "${UNHEALTHY:-0}" = "0" ] && ok "no container is unhealthy or exited" \
  || warn "$UNHEALTHY container(s) unhealthy — run: docker compose ps"

hr "Verdict"
echo "   passed: $PASS   warnings: $WARN   failed: $FAIL"
echo
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo "   This Mac can host it. Everything Inex leans on came up clean."
elif [ "$FAIL" -eq 0 ]; then
  echo "   This Mac can host it, with the warnings above worth sorting first."
else
  echo "   Not yet. Fix the failures above before planning the migration —"
  echo "   each one is something Inex cannot work without."
fi
echo
echo "   Nothing was migrated and nothing of yours was touched. The throwaway"
echo "   stack is being deleted now."
