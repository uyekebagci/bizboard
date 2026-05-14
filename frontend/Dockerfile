# ============================================================================
# BizBoard Frontend (Next.js) — multi-stage Dockerfile
#
# NEXT_PUBLIC_* values are inlined into the client bundle by Next.js at BUILD
# time. Some PaaS providers (incl. Sevalla) don't forward app env vars to
# `docker build` as --build-arg, so the ARG defaults below must hold the real
# production URLs. To target a different environment (e.g. test), override
# them at build time:
#
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://test-api.example.com \
#     --build-arg NEXT_PUBLIC_ENV=test \
#     -t bizboard-web:test frontend/
#
# Or use a deployment-specific Dockerfile (e.g. Dockerfile.test).
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

# Production defaults — match the prod Sevalla backend URL.
ARG NEXT_PUBLIC_API_URL=https://bizboard-c7pem.sevalla.app
ARG NEXT_PUBLIC_ENV=prod
ARG NEXT_PUBLIC_APP_VERSION=latest
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

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
