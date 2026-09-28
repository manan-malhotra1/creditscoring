#!/usr/bin/env bash
# Waits for the Ecocash Rule Engine staging API to come back.
#
# The build with the product-profiles module is the one that works, so the
# cheap read-only GET /product-profiles is the trigger: while it 404s the old
# build is serving and assessment cannot work. Only when it answers 200 do we
# spend a POST /decisions to confirm the whole flow end to end.
#
# Exits 0 the moment a real assessment succeeds, 2 if the deadline passes.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${CREDIT_API_BASE:-https://staging.sasaipaymentgateway.com/staging/creditscoring}"
TENANT="${CREDIT_TENANT:-legacy}"
PRODUCT="${CREDIT_PRODUCT:-device_financing}"
CUSTOMER="${CREDIT_CUSTOMER:-774756402}"   # succeeded at 07:52 on 28 Sep
INTERVAL="${CREDIT_POLL_INTERVAL:-90}"
DEADLINE_MINUTES="${CREDIT_POLL_MINUTES:-480}"   # shell arithmetic is integer only
LOG="$DIR/poll.log"

KEY="${CREDIT_API_KEY:-}"
[ -z "$KEY" ] && [ -f "$DIR/.env" ] && KEY=$(sed -n 's/^CREDIT_API_KEY=//p' "$DIR/.env" | tr -d '"'"'"' \r')
if [ -z "$KEY" ]; then echo "no API key; see api-tests/.env" >&2; exit 3; fi

say () { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" | tee -a "$LOG"; }

END=$(( $(date +%s) + DEADLINE_MINUTES * 60 ))
say "poller started: every ${INTERVAL}s for ${DEADLINE_MINUTES}m, tenant=$TENANT customer=$CUSTOMER"
n=0; last=""
while [ "$(date +%s)" -lt "$END" ]; do
  n=$((n + 1))
  pp=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
        "$BASE/product-profiles?tenantId=$TENANT" -H "X-API-Key: $KEY" || echo 000)

  if [ "$pp" = "200" ]; then
    say "GET /product-profiles -> 200, the profiles build is live. Confirming with a real assessment."
    body=$(curl -s --max-time 60 -o "$DIR/poll-success.json" -w '%{http_code}' \
      -X POST "$BASE/decisions" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
      -d "{\"tenantId\":\"$TENANT\",\"productCode\":\"$PRODUCT\",\"customerId\":$CUSTOMER,\"requestedAmount\":300,\"requestedTenure\":4,\"channel\":\"app\"}" || echo 000)
    if [ "$body" = "200" ] || [ "$body" = "201" ]; then
      say "POST /decisions -> $body. API IS BACK after $n checks. Response in api-tests/poll-success.json"
      exit 0
    fi
    say "POST /decisions -> $body, profiles are up but assessment still failing. Continuing."
  else
    # One line per state change, plus a periodic heartbeat, so the log stays readable.
    if [ "$pp" != "$last" ]; then
      say "still down: GET /product-profiles -> $pp (check $n)"
    elif [ $((n % 20)) -eq 0 ]; then
      say "still down after $n checks (GET /product-profiles -> $pp)"
    fi
  fi
  last="$pp"
  sleep "$INTERVAL"
done
say "deadline reached after $n checks, API never came back"
exit 2
