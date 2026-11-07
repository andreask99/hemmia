# Deploying the relay

The relay is one container on any Linux host with Docker and a public address. Nothing here
assumes a provider: the hosting choice is made before going live (DECISIONS.md 2026-10-23).
Until then everything runs locally (see `scripts/dev-stack.ts` and `npm run e2e:relay`).

## What the host needs

- Debian 12 or Ubuntu 24.04, public IPv4 (IPv6 optional), ports 22 and 443 reachable.
- DNS for the relay domain at a provider with an API the relay supports (today: Cloudflare;
  others are a `DnsProvider` in `src/dns/`). Records: `A`/`AAAA` for `api`, `tunnel`, `join`
  and the wildcard `*.h`, all pointing at the host.
- An API token that can edit DNS records of that one zone.

## First deploy

1. Copy `deploy/` to the host and run `sudo ./setup-host.sh` once. On a host with an included
   traffic allowance also run `sudo ./traffic-cap.sh` (stops the relay past `LIMIT_GB` sent in a
   month, default 3000; `sudo hemmia-relay-cap status`). On Oracle open TCP 443 in the subnet's
   security list too; the script opens it in the image's own iptables ruleset.
   Hemmia's relay: Oracle Always Free VM `hemmia-relay` (Zurich),
   `ssh -i ~/.ssh/hemmia-relay.key ubuntu@api.hemmia.app` (DECISIONS.md 2026-11-07).
2. Create `/srv/relay/secrets/relay.env` (mode 0600):
   ```
   RELAY_DOMAIN=relay.example
   # RELAY_ACME_EMAIL=…         optional: Let's Encrypt no longer sends expiry emails
   RELAY_ACME_DIRECTORY=https://acme-staging-v02.api.letsencrypt.org/directory
   RELAY_DNS_PROVIDER=cloudflare
   CLOUDFLARE_API_TOKEN=…
   CLOUDFLARE_ZONE_ID=…
   RELAY_DATA_KEY=…            # 32 random bytes, base64url: openssl rand 32 | basenc --base64url | tr -d =
   APP_ID=…                     # push and app links, once the apps exist
   ```
   Without push credentials the relay runs; push stays off (one warning line at start).
   Create empty `apns.p8` and `fcm.json` in the secrets directory until push is set up (the
   compose file mounts them).
3. Build the image on a development machine and copy it over (no registry needed), or build it
   on the host from the same files (`apps/relay`, `packages/relay-protocol`, root
   `package.json` and `package-lock.json`):
   ```sh
   docker buildx build -f apps/relay/Dockerfile --platform linux/amd64 -t hemmia-relay:latest --load .
   docker save hemmia-relay:latest | ssh root@host docker load
   ```
4. `cd /srv/relay && docker compose up -d`, then
   `curl https://api.relay.example/v1/health` → `{"status":"ok"}` (staging certificates are
   not trusted by browsers; use `curl -k` until the switch to production).
5. Switch `RELAY_ACME_DIRECTORY` to `https://acme-v02.api.letsencrypt.org/directory` once the
   staging checks pass (P2.15), delete the staging certificate
   (`rm /srv/relay/data/tls/relay-*.pem`; it would otherwise stay until renewal) and
   `docker compose up -d --force-recreate`. The ACME account registers anew on the production
   server by itself. Hubs that got a staging certificate keep it until renewal: test hubs only.

## Updates

Build and load a new image as in step 3, then `docker compose up -d`. Hubs reconnect by
themselves (the relay sends GOAWAY on shutdown).

## Operations

- Admin commands: `docker compose exec relay node src/cli.ts list-hubs|block-hub|unblock-hub|stats`.
- Backups: nightly into `/srv/relay/backup/<date>/` (database, ACME account, relay key), 7 kept.
  The backup directory is readable by root only. Hemmia's relay: the family Mac copies the
  newest one (plus `RELAY_DATA_KEY`) daily at 05:15 to `~/Library/Application Support/Hemmia
  Relay Backups/`, 30 kept (`ops/relay-backup-pull.sh`, LaunchAgent `app.hemmia.relay-backup`).
- Logs: `journalctl CONTAINER_TAG=relay` (kept 14 days). They hold hub ids and truncated
  addresses only (RELAY.md §10).
