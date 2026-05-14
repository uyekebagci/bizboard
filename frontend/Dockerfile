# ============================================================================
# BizBoard Frontend (Next.js) — multi-stage Dockerfile
#
# Runtime-config pattern:
#   Next.js bakes NEXT_PUBLIC_* values into the client bundle at BUILD time,
#   but some PaaS providers (including Sevalla) do not pipe app environment
#   variables to `docker build` as --build-arg. To stay portable, we bake
#   unique placeholder strings at build time and replace them with the real
#   runtime values during container startup. This means the SAME image runs
#   in prod, test, and local dev — only the env vars differ.
#
# Build:   docker build -t bizboard-web:local frontend/
# Run:     docker run --rm -p 3000:3000 \
#              -e NEXT_PUBLIC_API_URL=https://api.example.com \
#              bizboard-web:local
# ============================================================================

# ── 1) Dependencies stage ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY bizboard/package.json bizboard/package-lock.json* ./
RUN npm ci --no-audit --no-fund


# ── 2) Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY bizboard/ ./

# IMPORTANT: these placeholder strings are intentionally distinctive — they get
# inlined as JS string literals (e.g. "__BIZBOARD_API_URL__") by Next.js. At
# container startup, entrypoint.sh runs a sed pass that swaps them for the real
# runtime env values. Keep them URL-safe and free of regex specials.
ARG NEXT_PUBLIC_API_URL=__BIZBOARD_API_URL__
ARG NEXT_PUBLIC_ENV=__BIZBOARD_ENV__
ARG NEXT_PUBLIC_APP_VERSION=__BIZBOARD_APP_VERSION__
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV \
    NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ── 3) Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl tini && \
    addgroup -S -g 1001 app && adduser -S -G app -u 1001 app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=app:app /app/.next        ./.next
COPY --from=build --chown=app:app /app/public       ./public
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/next.config.js ./next.config.js

# Entrypoint script: swaps placeholders → runtime env values, then exec's next.
COPY --chown=app:app entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
