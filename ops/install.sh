#!/usr/bin/env bash
# Builds Hemmia and (re)installs the LaunchAgent. Run from the repo: ops/install.sh [--ref <tag>] <tailnet-hostname>
# e.g. ops/install.sh --ref live-2026-10-23 kchat-mac.tail1234.ts.net   (no sudo needed)
# With --ref (the family hub's live checkout): fetches tags, checks out <tag> detached, then installs.
set -euo pipefail
REF=""
if [ "${1:-}" = "--ref" ]; then
  REF=${2:?usage: ops/install.sh --ref <tag> <tailnet hostname>}
  shift 2
fi
HOST=${1:?usage: ops/install.sh [--ref <tag>] <tailnet hostname, e.g. kchat-mac.tail1234.ts.net>}
REPO=$(cd "$(dirname "$0")/.." && pwd)
if [ -n "$REF" ]; then
  if [ "$REPO" = "$HOME/apps/kchat" ]; then
    echo "Refusing: --ref is for the live checkout (e.g. ~/apps/kchat-live), not the development tree." >&2
    exit 1
  fi
  cd "$REPO"
  if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing: the live checkout has local changes." >&2
    exit 1
  fi
  git fetch --tags origin
  git checkout --detach "refs/tags/$REF"
  # Re-run the script as checked out at the tag, without --ref.
  exec "$REPO/ops/install.sh" "$HOST"
fi
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use --silent 22
NODE=$(command -v node)
# The relay for Hemmia Connect (DECISIONS.md 2026-11-07). Setting it only offers Connect in
# Settings → System; the admin switches it on there.
RELAY_DOMAIN=${HEMMIA_RELAY_DOMAIN:-hemmia.app}
LOGDIR="$HOME/Library/Logs/Hemmia"
PLIST="$HOME/Library/LaunchAgents/app.hemmia.server.plist"
mkdir -p "$LOGDIR"; chmod 700 "$LOGDIR"

cd "$REPO"
npm ci --no-audit --no-fund
npm run check
npm run build
(cd services/imagegen && uv sync --frozen)

sed -e "s#__NODE__#$NODE#g" -e "s#__REPO__#$REPO#g" -e "s#__HOSTNAME__#$HOST#g" -e "s#__LOGDIR__#$LOGDIR#g" \
  -e "s#__RELAY_DOMAIN__#$RELAY_DOMAIN#g" ops/app.hemmia.server.plist.template > "$PLIST"
# LaunchAgents from before the rename to Hemmia (P8.2): stop and remove them once, right
# before the new one starts (the build above runs while the old hub still serves).
for OLD in com.kchat.server com.kchat.maintenance; do
  launchctl bootout "gui/$(id -u)/$OLD" 2>/dev/null || true
  for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/$OLD" >/dev/null 2>&1 || break; sleep 0.5; done
  rm -f "$HOME/Library/LaunchAgents/$OLD.plist"
done
launchctl bootout "gui/$(id -u)/app.hemmia.server" 2>/dev/null || true
# bootout returns before the old instance is gone; bootstrap fails (error 5) until it is.
for _ in $(seq 1 20); do
  launchctl print "gui/$(id -u)/app.hemmia.server" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
curl -fsS -H "Host: localhost" http://127.0.0.1:8787/api/health && echo " Hemmia is running"

# Monthly maintenance job (updates Ollama and SearXNG, tests, rolls back on failure).
MPLIST="$HOME/Library/LaunchAgents/app.hemmia.maintenance.plist"
sed -e "s#__NODE__#$NODE#g" -e "s#__NODEDIR__#$(dirname "$NODE")#g" -e "s#__REPO__#$REPO#g" \
  -e "s#__HOSTNAME__#$HOST#g" -e "s#__LOGDIR__#$LOGDIR#g" ops/app.hemmia.maintenance.plist.template > "$MPLIST"
launchctl bootout "gui/$(id -u)/app.hemmia.maintenance" 2>/dev/null || true
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/app.hemmia.maintenance" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$MPLIST" && echo "Monthly maintenance scheduled (1st of the month, 03:30)"
echo "Logs: $LOGDIR"
