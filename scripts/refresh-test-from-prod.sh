#!/usr/bin/env bash
# =============================================================================
# refresh-test-from-prod.sh
#
# Copies the BizBoard production dataset into the test environment, including:
#
#   1. PostgreSQL: pg_dump → restore (with optional anonymisation)
#   2. Object storage uploads: `aws s3 sync` from prod bucket → test bucket
#   3. Smoke check the test backend health endpoint
#
# Designed to run from:
#   • A Sevalla scheduled task (recommended: daily at 03:30 Europe/Istanbul)
#   • GitHub Actions cron workflow (.github/workflows/refresh-test.yml)
#   • An operator's laptop in an emergency
#
# Requirements:
#   - psql, pg_dump  (PostgreSQL 16+ client)
#   - aws            (AWS CLI v2; works for any S3-compatible provider)
#   - curl
#
# Environment variables (all required):
#
#   PROD_DATABASE_URL        postgresql://user:pass@host:5432/bizboard_prod
#   TEST_DATABASE_URL        postgresql://user:pass@host:5432/bizboard_test
#
#   S3_ENDPOINT              https://<sevalla-object-storage>
#   PROD_S3_BUCKET           bizboard-prod-uploads
#   TEST_S3_BUCKET           bizboard-test-uploads
#   AWS_ACCESS_KEY_ID        S3 access key (with read on prod, write on test)
#   AWS_SECRET_ACCESS_KEY    S3 secret key
#   AWS_DEFAULT_REGION       auto  (or actual region for AWS S3)
#
#   TEST_API_HEALTH_URL      https://test-api.example.com/actuator/health/readiness
#
# Optional:
#   ANONYMIZE                "true" to scrub PII fields after restore (default: true)
#   HEALTHCHECK_PING_URL     Dead-man's switch URL to ping on success
#
# Idempotency:
#   The script DROPS the public schema in TEST before restore. Anything stored
#   in the test DB will be lost — that is the contract.
# =============================================================================

set -euo pipefail

# ─── helpers ────────────────────────────────────────────────────────────────
log()  { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

require() {
    for v in "$@"; do
        if [[ -z "${!v:-}" ]]; then fail "Required env var $v is not set"; fi
    done
}

# ─── 0. pre-flight ──────────────────────────────────────────────────────────
require PROD_DATABASE_URL TEST_DATABASE_URL \
        S3_ENDPOINT PROD_S3_BUCKET TEST_S3_BUCKET \
        AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY \
        TEST_API_HEALTH_URL

command -v pg_dump >/dev/null || fail "pg_dump not found in PATH"
command -v psql    >/dev/null || fail "psql not found in PATH"
command -v aws     >/dev/null || fail "aws (CLI v2) not found in PATH"
command -v curl    >/dev/null || fail "curl not found in PATH"

ANONYMIZE="${ANONYMIZE:-true}"
DUMP_FILE="$(mktemp -t bizboard-prod.XXXXXX.dump)"
trap 'rm -f "$DUMP_FILE"' EXIT

log "Refresh started — anonymize=$ANONYMIZE"

# ─── 1. DB: dump prod ───────────────────────────────────────────────────────
log "[1/4] Dumping production database…"
pg_dump --no-owner --no-acl --clean --if-exists --format=custom \
        --dbname="$PROD_DATABASE_URL" \
        --file="$DUMP_FILE"

log "      → $(du -h "$DUMP_FILE" | cut -f1) dump captured"

# ─── 2. DB: restore into test ───────────────────────────────────────────────
log "[2/4] Resetting test schema and restoring dump…"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c '
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
'

pg_restore --no-owner --no-acl --clean --if-exists \
           --dbname="$TEST_DATABASE_URL" \
           "$DUMP_FILE"

# ─── 2b. anonymise PII ──────────────────────────────────────────────────────
if [[ "$ANONYMIZE" == "true" ]]; then
    log "      → applying anonymisation"
    psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
        -- Replace real user emails / phone with deterministic test values.
        UPDATE users SET email   = 'user+' || id || '@bizboard.test'
                       WHERE email IS NOT NULL;
        UPDATE users SET phone   = '+90555' || lpad((floor(random()*9999999))::text, 7, '0')
                       WHERE phone IS NOT NULL;

        -- Replace customer/supplier names referenced from debts/transactions.
        UPDATE debts SET counterparty_name = 'Test Counterparty ' || id
                       WHERE counterparty_name IS NOT NULL;
        UPDATE transactions SET note = NULL WHERE note ILIKE '%@%';

        -- Reset the seeded admin so testers can always sign in.
        UPDATE users
           SET email = 'admin@bizboard.test',
               password = '$2a$10$wJxQjvSUMfuKcw7VYUuO5enxVuy4Lq2yqJ0eYx0HRn7ZyfX7HpIIu' -- bcrypt('admin123')
         WHERE role = 'ADMIN';
SQL
fi

# ─── 3. Object storage sync prod → test ─────────────────────────────────────
log "[3/4] Syncing object storage uploads…"
aws --endpoint-url="$S3_ENDPOINT" s3 sync \
    "s3://$PROD_S3_BUCKET/" "s3://$TEST_S3_BUCKET/" \
    --delete --only-show-errors

# ─── 4. Smoke: readiness probe ──────────────────────────────────────────────
log "[4/4] Probing test API readiness…"
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$TEST_API_HEALTH_URL" || echo "000")
if [[ "$HTTP_CODE" != "200" ]]; then
    fail "Test API readiness probe returned HTTP $HTTP_CODE"
fi

log "✓ Refresh completed successfully"

# Optional dead-man's switch ping
if [[ -n "${HEALTHCHECK_PING_URL:-}" ]]; then
    curl -fsS --max-time 10 --retry 3 "$HEALTHCHECK_PING_URL" >/dev/null || true
fi
