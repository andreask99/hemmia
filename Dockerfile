# The hub image (PLAN.md P6.2, ARCHITECTURE.md §3.5). Build from the repository root:
#   docker buildx build --platform linux/amd64,linux/arm64 -t hemmia-hub .
# Run it with packaging/docker/compose.yaml. node:22-bookworm-slim, pinned by digest
# (2026-10-23, Node 22.23.3; the same base as the relay).
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# 1. The web app (needs the dev dependencies: vite, tailwind).
FROM ${NODE_IMAGE} AS web
WORKDIR /src
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/relay-protocol/package.json packages/relay-protocol/package.json
RUN npm ci --workspace=@hemmia/web --include-workspace-root --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY packages/relay-protocol packages/relay-protocol
COPY apps/web apps/web
RUN npm run build -w @hemmia/web

# 2. The server's production dependencies, with native modules built for this platform.
FROM ${NODE_IMAGE} AS deps
# better-sqlite3 has no prebuilt Linux binaries for every release: compile here, so the
# runtime image carries no compiler.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/relay-protocol/package.json packages/relay-protocol/package.json
RUN npm ci --omit=dev --workspace=@hemmia/server --include-workspace-root=false --no-audit --no-fund \
 && npm cache clean --force

# 3. The runtime: no npm cache, no build tools, no tests.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    HEMMIA_CONTAINER=1 \
    HEMMIA_HOST=0.0.0.0 \
    HEMMIA_DATA_DIR=/data \
    HEMMIA_MODELS_FILE=/app/config/models.public.json \
    HEMMIA_UPDATE_CHECK=1
WORKDIR /app
COPY --from=deps /app ./
COPY packages/shared/src packages/shared/src
COPY packages/providers/src packages/providers/src
COPY packages/relay-protocol/src packages/relay-protocol/src
COPY apps/server/src apps/server/src
COPY config config
COPY --from=web /src/apps/web/dist apps/web/dist

# A fixed, unprivileged user; the data volume belongs to it.
RUN useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin hemmia \
 && mkdir -p /data && chown hemmia:hemmia /data && chmod 700 /data
USER hemmia
WORKDIR /app/apps/server
EXPOSE 8787
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(function(r){process.exit(r.ok?0:1)},function(){process.exit(1)})"
CMD ["node", "src/main.ts"]
