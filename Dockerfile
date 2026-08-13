# syntax=docker/dockerfile:1

# ---- build stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 is a native module; these are only needed if no prebuilt
# binary is available for the target platform (e.g. under arm64 emulation).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Data (the SQLite file) lives on a mounted volume so it survives upgrades.
ENV DATABASE_PATH=/app/data/linkbank.db
VOLUME /app/data

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# server.js optionally serves HTTPS directly (set TLS_KEY_PATH/TLS_CERT_PATH);
# with no TLS env it's an exact pass-through to the stock adapter server.
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/healthcheck.js ./healthcheck.js

EXPOSE 3000
# SvelteKit's node adapter needs ORIGIN for correct URLs behind a proxy;
# override at runtime (e.g. ORIGIN=https://links.example.com).
ENV ORIGIN=http://localhost:3000

# To serve HTTPS directly (LAN + self-signed cert, no reverse proxy), bind-mount
# the PEM files (e.g. -v ./certs:/app/certs:ro) and set TLS_KEY_PATH,
# TLS_CERT_PATH, and ORIGIN=https://host:3000.

# Liveness check — protocol-aware (http/https) and tolerant of a self-signed
# cert on loopback. Treats any <400 response as healthy (/login 303->/setup).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "server.js"]

# OCI image metadata. VERSION/REVISION/CREATED are supplied at build time
# (the CI passes them; they default to "dev" for local builds).
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="LinkBank" \
      org.opencontainers.image.description="Self-hostable bookmark manager with an editable, drag-sortable folder tree." \
      org.opencontainers.image.url="https://github.com/YngF/linkbank" \
      org.opencontainers.image.source="https://github.com/YngF/linkbank" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"
