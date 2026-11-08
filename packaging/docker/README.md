# Hemmia hub with Docker

For Linux, Windows (Docker Desktop) and a NAS that runs Docker. On a Mac, the macOS package is
simpler (it keeps the Mac awake and can use the Mac's GPU for local models through Ollama).

## Quick start

```sh
cd packaging/docker
./start.sh
```

It starts the hub, Ollama for local models and SearXNG for web search (the first time it creates
`.env` with a random SearXNG secret), waits for the hub and opens the setup page, or prints its
address. Open it **on the same computer**: the hub only listens on `127.0.0.1`. The setup link
is valid for 24 hours; `docker compose restart hub` and `./start.sh` show a new one.

Options: `./start.sh --no-ollama` (cloud models, or Ollama elsewhere with `OLLAMA_URL`, e.g.
`OLLAMA_URL=http://host.docker.internal:11434` in `.env` on Docker Desktop), `--no-search`.
Port 8787 taken: `HEMMIA_PORT=8790` in `.env`.

The same with Compose directly: `docker compose --profile ollama --profile searxng up -d`
(SearXNG needs `SEARXNG_SECRET` in `.env`), then `docker compose logs hub | grep "Hemmia setup"`.

## A machine without a browser (NAS, server)

Set `HEMMIA_CONNECT=1` in `.env` next to `compose.yaml`. The hub then turns on Hemmia Connect at
start and the log also shows `Hemmia setup: or open https://<hub>.h.<relay>/setup#…`, which
works from any device. Only you have that link; it works once.

## Tailscale instead of Connect

On the computer: `tailscale serve --bg --https=443 http://127.0.0.1:8787`, then put
`HEMMIA_PUBLIC_HOSTNAMES=<name>.ts.net` (this computer's name from `tailscale status`) into
`.env` and run `docker compose up -d` again. Never use `tailscale funnel` for the hub.

## Web search

Included in `./start.sh`; leave it out with `--no-search`.

## Update check

Once a day the hub asks hemmia.app whether a newer version exists, sending only its version,
the platform and the channel. To turn this off, put `HEMMIA_UPDATE_CHECK=0` into `.env` and run
`docker compose up -d` again.

## Updating

```sh
git pull
./start.sh
```

`start.sh` rebuilds the hub from the new code and restarts what changed (use the same options as
before, e.g. `--no-ollama`).

Data stays in the `hemmia-data` volume. Replies being written while the hub restarts stop.

## Backups

All of the hub's data is in the volume `hemmia-data` (accounts, chats, attachments, keys).
Chats are encrypted per person, but the backup still needs care. Stop the hub for a
consistent copy:

```sh
docker compose stop hub
docker run --rm -v hemmia_hemmia-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/hemmia-data.tar.gz -C /data .
docker compose start hub
```

Restore by extracting the archive into an empty `hemmia-data` volume the same way, before the
hub starts.

## Known limits

With Docker's port mapping, every connection that doesn't come through Hemmia Connect (the
browser on this computer, Tailscale) reaches the hub from Docker's gateway address. The hub
trusts no forwarded headers in a container, so these clients share one sign-in rate limit
(20 attempts per window). Connections through Connect keep their own addresses.

## Not verified yet

These files were written before Docker was installed on the development Mac (PLAN.md P6.2):
the build, `read_only` with `/tmp` as the only writable place besides `/data`, and the
SearXNG profile still need a real run.
