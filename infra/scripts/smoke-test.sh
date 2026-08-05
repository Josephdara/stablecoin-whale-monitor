#!/usr/bin/env bash
# Post-deploy verification for the Stablecoin Whale Monitor test estate.
#
# Two tiers. The HTTP tier asserts everything observable from outside and needs
# no GCP permissions, so it runs under the CD service account, which can read
# neither the events bucket nor the state bucket. The GCP tier asserts storage
# policy and is skipped automatically when the caller cannot read bucket
# metadata — run it locally, or from any identity holding storage.buckets.get.
set -uo pipefail

PUBLIC_URL="${PUBLIC_URL:-https://swm.josephdara.com}"
ALERTER_URL="${ALERTER_URL:-https://swm-alerter-test-pkklwzsqha-uk.a.run.app}"
PROJECT_ID="${PROJECT_ID:-swm-gcp-test-v2}"
EVENTS_BUCKET="${EVENTS_BUCKET:-swm-gcp-test-v2-events}"
STATE_BUCKET="${STATE_BUCKET:-swm-gcp-test-v2-app-state}"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-swm-gcp-state-v2}"
EVENT_PREFIX="${EVENT_PREFIX:-ethereum/ranges/}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
MAX_CHECKPOINT_AGE="${MAX_CHECKPOINT_AGE:-180}"
ADVANCE_WAIT="${ADVANCE_WAIT:-60}"

pass=0
fail=0
skip=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }
skipped() { printf '  \033[33mSKIP\033[0m  %s\n' "$1"; skip=$((skip + 1)); }
section() { printf '\n%s\n' "$1"; }

# assert <description> <expected> <actual>
assert() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$2', got '$3')"; fi
}

# assert_contains <description> <needle> <haystack>
assert_contains() {
  case "$3" in
    *"$2"*) ok "$1" ;;
    *) bad "$1 (missing '$2')" ;;
  esac
}

section "Edge: frontend"

root_code=$(curl -sS -o /tmp/smoke-root.html -w '%{http_code}' "$PUBLIC_URL/")
root_type=$(curl -sSI "$PUBLIC_URL/" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
assert "root returns 200" "200" "$root_code"
case "$root_type" in
  text/html*) ok "root is text/html" ;;
  *) bad "root is text/html (got '$root_type')" ;;
esac

# A backend bucket without MainPageSuffix serves an XML object listing here.
if grep -qi '<ListBucketResult' /tmp/smoke-root.html; then
  bad "root is the dashboard, not an XML bucket listing"
else
  ok "root is the dashboard, not an XML bucket listing"
fi
assert_contains "root contains an HTML document" "<!DOCTYPE html>" "$(head -c 200 /tmp/smoke-root.html)"

nested_code=$(curl -sS -o /dev/null -w '%{http_code}' "$PUBLIC_URL/404/")
assert "nested trailing-slash route returns 200" "200" "$nested_code"

nf_code=$(curl -sS -o /tmp/smoke-404.html -w '%{http_code}' "$PUBLIC_URL/definitely-not-a-real-page")
assert "unknown path returns 404" "404" "$nf_code"
assert_contains "unknown path serves 404.html, not an error page" "<!DOCTYPE html>" "$(head -c 200 /tmp/smoke-404.html)"

section "Edge: caching"

html_cc=$(curl -sSI "$PUBLIC_URL/" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')
assert_contains "HTML uses the short cache policy" "max-age=60" "$html_cc"

asset_path=$(grep -oE '/_next/static/chunks/[A-Za-z0-9_.-]+\.js' /tmp/smoke-root.html | head -1)
if [ -n "$asset_path" ]; then
  asset_cc=$(curl -sSI "$PUBLIC_URL$asset_path" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')
  assert_contains "hashed assets use the one-year policy" "max-age=31536000" "$asset_cc"
else
  bad "could not find a hashed asset to check (is the export complete?)"
fi

section "Edge: transport"

redirect_code=$(curl -sS -o /dev/null -w '%{http_code}' "http://${PUBLIC_URL#https://}/")
assert "port 80 returns 301" "301" "$redirect_code"

# The SSL policy pins TLS 1.2 as the minimum; 1.1 must be refused.
if curl -sS --tlsv1.1 --tls-max 1.1 -o /dev/null "$PUBLIC_URL/" 2>/dev/null; then
  bad "TLS 1.1 is refused"
else
  ok "TLS 1.1 is refused"
fi

section "API"

health=$(curl -sS "$PUBLIC_URL/api/health")
assert_contains "health reports mainnet" '"chainId":1' "$health"
assert_contains "health reports ok" '"status":"ok"' "$health"

age=$(printf '%s' "$health" | grep -o '"checkpointAgeSeconds":[0-9]*' | cut -d: -f2)
if [ -n "$age" ] && [ "$age" -le "$MAX_CHECKPOINT_AGE" ]; then
  ok "checkpoint age is bounded (${age}s <= ${MAX_CHECKPOINT_AGE}s)"
else
  bad "checkpoint age is bounded (got '${age:-none}s')"
fi

# Proves the worker pool is live without needing bucket read access.
block_before=$(printf '%s' "$health" | grep -o '"lastProcessedBlock":[0-9]*' | cut -d: -f2)
printf '  ....  waiting %ss for the indexer to advance\n' "$ADVANCE_WAIT"
sleep "$ADVANCE_WAIT"
block_after=$(curl -sS "$PUBLIC_URL/api/health" | grep -o '"lastProcessedBlock":[0-9]*' | cut -d: -f2)
if [ -n "$block_before" ] && [ -n "$block_after" ] && [ "$block_after" -gt "$block_before" ]; then
  ok "worker pool advances the checkpoint ($block_before -> $block_after)"
else
  bad "worker pool advances the checkpoint ($block_before -> $block_after)"
fi

transfers_code=$(curl -sS -o /dev/null -w '%{http_code}' "$PUBLIC_URL/api/transfers?limit=5")
assert "transfers endpoint responds" "200" "$transfers_code"

section "Isolation"

alerter_code=$(curl -sS -o /dev/null -w '%{http_code}' "$ALERTER_URL/pubsub" -X POST -H 'Content-Type: application/json' -d '{}')
if [ "$alerter_code" = "200" ] || [ "$alerter_code" = "204" ]; then
  bad "alerter rejects unauthenticated calls (got $alerter_code)"
else
  ok "alerter rejects unauthenticated calls ($alerter_code)"
fi

section "Storage policy"

if ! command -v gcloud >/dev/null 2>&1 || \
   ! gcloud storage buckets describe "gs://$EVENTS_BUCKET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  skipped "storage policy checks (identity cannot read bucket metadata)"
else
  events_lc=$(gcloud storage buckets describe "gs://$EVENTS_BUCKET" --project="$PROJECT_ID" --format='value(lifecycle_config)' 2>/dev/null)
  assert_contains "events bucket has the age-${RETENTION_DAYS} rule" "'age': $RETENTION_DAYS" "$events_lc"
  assert_contains "events lifecycle is scoped to $EVENT_PREFIX" "$EVENT_PREFIX" "$events_lc"

  state_lc=$(gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" --format='value(lifecycle_config)' 2>/dev/null)
  assert "application state has no lifecycle" "" "$state_lc"

  tf_lc=$(gcloud storage buckets describe "gs://$TF_STATE_BUCKET" --project="$PROJECT_ID" --format='value(lifecycle_config)' 2>/dev/null)
  assert "terraform state has no lifecycle" "" "$tf_lc"

  for b in "$EVENTS_BUCKET" "$STATE_BUCKET"; do
    pap=$(gcloud storage buckets describe "gs://$b" --project="$PROJECT_ID" --format='value(public_access_prevention)' 2>/dev/null)
    assert "$b enforces public access prevention" "enforced" "$pap"
  done
fi

printf '\n%s\n' "-----------------------------------------"
printf 'passed %s   failed %s   skipped %s\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ] || exit 1