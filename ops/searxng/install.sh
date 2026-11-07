#!/usr/bin/env bash
# Installs or updates SearXNG (web search for kchat) as a local-only LaunchAgent on 127.0.0.1:8888.
# Usage: ops/searxng/install.sh [git-commit]   (no sudo needed)
#   Without a commit: keeps the installed one (or the tested pin on a fresh install).
#   scripts/maintenance.ts passes the newest upstream commit and rolls back on failure.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
DIR="$HOME/.local/share/kchat/searxng"
PIN=a9d99003344ac3879ec45c56c661283482a92a39   # tested 2026-10-02
COMMIT=${1:-$(git -C "$DIR/src" rev-parse HEAD 2>/dev/null || echo "$PIN")}
PLIST="$HOME/Library/LaunchAgents/app.hemmia.searxng.plist"

mkdir -p "$DIR"
if [ ! -d "$DIR/src/.git" ]; then git clone -q https://github.com/searxng/searxng.git "$DIR/src"; fi
git -C "$DIR/src" fetch -q origin && git -C "$DIR/src" checkout -q "$COMMIT"
[ -d "$DIR/.venv" ] || uv venv -q --python 3.13 "$DIR/.venv"
VIRTUAL_ENV="$DIR/.venv" uv pip install -q -r "$DIR/src/requirements.txt"

mkdir -p "$DIR/etc"; chmod 700 "$DIR/etc"
SECRET=$(grep -o 'secret_key: "[0-9a-f]\{64\}"' "$DIR/etc/settings.yml" 2>/dev/null | cut -d'"' -f2 || true)
[ -n "$SECRET" ] || SECRET=$(openssl rand -hex 32)
sed "s/__SECRET__/$SECRET/" "$REPO/ops/searxng/settings.yml" > "$DIR/etc/settings.yml"
chmod 600 "$DIR/etc/settings.yml"

sed "s#__DIR__#$DIR#g" "$REPO/ops/searxng/app.hemmia.searxng.plist.template" > "$PLIST"
# The LaunchAgent from before the rename to Hemmia (P8.2), on the same port.
launchctl bootout "gui/$(id -u)/com.kchat.searxng" 2>/dev/null || true
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/com.kchat.searxng" >/dev/null 2>&1 || break; sleep 0.5; done
rm -f "$HOME/Library/LaunchAgents/com.kchat.searxng.plist"
launchctl bootout "gui/$(id -u)/app.hemmia.searxng" 2>/dev/null || true
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/app.hemmia.searxng" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$PLIST"
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:8888/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:8888/search?q=test&format=json" >/dev/null && echo "SearXNG is running on 127.0.0.1:8888"
