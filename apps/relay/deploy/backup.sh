#!/usr/bin/env bash
# Nightly backup of the relay data (database and keys); keeps the last 7. Run by relay-backup.timer.
set -euo pipefail
umask 077
stamp=$(date -u +%Y-%m-%d)
dest="/srv/relay/backup/$stamp"
mkdir -p "$dest"
sqlite3 /srv/relay/data/relay.db ".backup '$dest/relay.db'"
for d in acme tls; do
  [ -d "/srv/relay/data/$d" ] && cp -a "/srv/relay/data/$d" "$dest/"
done
ls -1d /srv/relay/backup/*/ | sort | head -n -7 | xargs -r rm -rf
