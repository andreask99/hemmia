# The relay image (RELAY.md §12). Build from the repository root:
#   docker buildx build -f apps/relay/Dockerfile --platform linux/amd64,linux/arm64 -t hemmia-relay .
# node:22-bookworm-slim, pinned by digest (2026-10-23, Node 22.23.3).
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS deps

# better-sqlite3 has no prebuilt Linux binaries for every release; compile it here so the final
# image carries no compiler.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Only what the relay needs: the root manifest and lock file, the relay and its protocol package.
COPY package.json package-lock.json ./
COPY apps/relay/package.json apps/relay/package.json
COPY packages/relay-protocol/package.json packages/relay-protocol/package.json
RUN npm ci --omit=dev --workspace=@hemmia/relay --include-workspace-root=false --no-audit --no-fund \
 && npm cache clean --force

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370

ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./

COPY packages/relay-protocol/src packages/relay-protocol/src
COPY apps/relay/src apps/relay/src
COPY apps/relay/static apps/relay/static

# A fixed, unprivileged user; port 443 is allowed by the CAP_NET_BIND_SERVICE the compose file adds.
RUN useradd --system --uid 10002 --home /nonexistent --shell /usr/sbin/nologin relay \
 && mkdir -p /data && chown relay:relay /data && chmod 700 /data
USER relay
WORKDIR /app/apps/relay
EXPOSE 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD node -e "require('node:net').connect(443,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})"
CMD ["node", "src/main.ts"]
