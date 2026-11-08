#!/bin/sh
# Starts Hemmia with Docker in one go: the hub, Ollama for local models and SearXNG for web
# search. The first time it creates .env with a random SearXNG secret. Then it waits for the hub
# and opens the setup page (or prints its address).
#   cd packaging/docker && ./start.sh
#   ./start.sh --no-ollama     the hub without local models (cloud models, or Ollama elsewhere)
#   ./start.sh --no-search     without web search
set -eu
cd "$(dirname "$0")"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker with Compose is needed: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

profiles="--profile ollama --profile searxng"
for arg in "$@"; do
  case "$arg" in
    --no-ollama) profiles=$(echo "$profiles" | sed 's/--profile ollama//') ;;
    --no-search) profiles=$(echo "$profiles" | sed 's/--profile searxng//') ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# .env: created once, never overwritten. The secret only protects SearXNG's own pages.
if [ ! -f .env ]; then
  secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  umask 077
  printf 'SEARXNG_SECRET=%s\n' "$secret" > .env
  echo "Created .env"
fi
case "$profiles" in
  *ollama*) ;;
  *) grep -q '^OLLAMA_URL=' .env || echo "Note: without --profile ollama, set OLLAMA_URL in .env to use Ollama elsewhere." ;;
esac

# The port on this computer (HEMMIA_PORT in .env, else 8787).
port=$(sed -n 's/^HEMMIA_PORT=\([0-9]*\)$/\1/p' .env | tail -1)
port=${port:-8787}

# shellcheck disable=SC2086 # the profiles are separate words on purpose
docker compose $profiles up -d --build

printf 'Waiting for Hemmia'
i=0
until curl -fsS -m 3 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo
    echo "Hemmia didn't start. Look at: docker compose logs hub" >&2
    exit 1
  fi
  printf '.'
  sleep 2
done
echo " running."

# The setup address is in the log while Hemmia has no account yet.
code=""
if curl -fsS -m 3 "http://127.0.0.1:$port/api/setup/state" | grep -q '"needsSetup":true'; then
  code=$(docker compose logs hub 2>/dev/null | grep -o '/setup#[A-Za-z0-9]*' | tail -1 || true)
fi
if [ -z "$code" ]; then
  echo "Hemmia is set up. Open http://localhost:$port on this computer."
  exit 0
fi
url="http://localhost:$port$code"
echo "Finish the setup in your browser: $url"
if command -v open >/dev/null 2>&1; then
  open "$url"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 || true
fi
