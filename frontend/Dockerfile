# ============================================================================
# BizBoard Frontend (Next.js) — multi-stage Dockerfile
#
# Build:   docker build -t bizboard-web:local frontend/
# Run:     docker run --rm -p 3000:3000 -e NEXT_PUBLIC_API_URL=... bizboard-web:local
#
# Sevalla auto-detects Next.js and can build without this Dockerfile, but
# shipping one makes the build reproducible and matches the prod target locally.
# ============================================================================

# ── 1) Dependencies stage ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Only copy lockfiles first → maximises Docker layer cache on dep installs.
COPY bizboard/package.json bizboard/package-lock.json* ./
RUN npm ci --no-audit --no-fund


# ── 2) Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY bizboard/ ./

# NEXT_PUBLIC_* values are baked at build time. Sevalla injects them as build
# args / env vars. Defaults match local dev.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
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

# Copy the minimum runtime artefacts. If your next.config.js enables
# `output: "standalone"`, the COPY block can be tightened to just .next/standalone.
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
