#!/bin/sh
# =============================================================================
# Container entrypoint — swaps build-time NEXT_PUBLIC_* placeholders for the
# real runtime env values, then execs the Next.js server.
#
# Why: Next.js inlines NEXT_PUBLIC_* into the client bundle at build time.
# Some PaaS providers (including Sevalla) don't forward env vars to
# `docker build` as --build-arg, so the bundle ends up with the ARG defaults.
# We bake distinctive placeholders at build time and substitute them here.
# =============================================================================

set -eu

# Pairs of placeholder ↔ runtime env var name.
# Add new NEXT_PUBLIC_* values here AND in the Dockerfile ARG section.
api_url="${NEXT_PUBLIC_API_URL:-}"
env_name="${NEXT_PUBLIC_ENV:-prod}"
version="${NEXT_PUBLIC_APP_VERSION:-latest}"

if [ -z "$api_url" ]; then
    echo "[entrypoint] WARNING: NEXT_PUBLIC_API_URL is not set; using empty string"
    echo "[entrypoint] WARNING: frontend will not be able to reach the backend"
fi

echo "[entrypoint] runtime config:"
echo "[entrypoint]   NEXT_PUBLIC_API_URL=$api_url"
echo "[entrypoint]   NEXT_PUBLIC_ENV=$env_name"
echo "[entrypoint]   NEXT_PUBLIC_APP_VERSION=$version"

# Files that may contain the inlined client values: server-rendered HTML, client
# JS chunks, and prerendered static fragments. Limit to the .next directory so
# we don't accidentally rewrite node_modules.
echo "[entrypoint] applying runtime config to .next/ …"

# Using `|` as the sed delimiter so URLs containing slashes are safe.
find ./.next -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' -o -name '*.css' \) \
    -exec sed -i \
        -e "s|__BIZBOARD_API_URL__|${api_url}|g" \
        -e "s|__BIZBOARD_ENV__|${env_name}|g" \
        -e "s|__BIZBOARD_APP_VERSION__|${version}|g" \
        {} +

echo "[entrypoint] runtime config applied. starting next…"

exec "$@"
