#!/usr/bin/env bash
# Installs a monthly cap on the host's outbound data (run once as root, after setup-host.sh).
# Every 5 minutes a timer adds up what the machine has sent this calendar month (UTC) and, past
# the limit, stops the relay container until the 1st. Meant for hosts with an included traffic
# allowance (Oracle's free 10 TB a month is shared with other projects in the account: 3 TB here).
# While stopped, Connect addresses don't answer; hubs stay reachable at home and via Tailscale.
#
#   sudo hemmia-relay-cap status          # this month's total, the limit, whether it tripped
#   sudo journalctl -t hemmia-relay-cap   # every stop and restart
#
# The limit is LIMIT_GB in /etc/hemmia-relay-cap.env (default 3000). It counts everything the
# machine sends, not only the relay, which errs on the safe side. Counting starts at install.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

cat > /usr/local/bin/hemmia-relay-cap <<'CAP'
#!/usr/bin/env bash
# Adds up this month's outbound bytes and stops the relay past LIMIT_GB. See traffic-cap.sh.
set -euo pipefail

[ -f /etc/hemmia-relay-cap.env ] && . /etc/hemmia-relay-cap.env
LIMIT_GB=${LIMIT_GB:-3000}
STATE_DIR=${STATE_DIR:-/var/lib/hemmia-relay-cap}
IFACE=${IFACE:-$(ip route | awk '/^default/ {print $5; exit}')}
TX_FILE=${TX_FILE:-/sys/class/net/$IFACE/statistics/tx_bytes}
MONTH=${MONTH:-$(date -u +%Y-%m)}
COMPOSE="docker compose -f /srv/relay/compose.yaml"

say() { echo "$*"; logger -t hemmia-relay-cap "$*" 2>/dev/null || true; }
running() { [ -n "$($COMPOSE ps -q --status running relay 2>/dev/null)" ]; }

mkdir -p "$STATE_DIR"
now=$(cat "$TX_FILE")
limit=$((LIMIT_GB * 1000 * 1000 * 1000))

# state: <month> <bytes counted this month> <interface counter at the last run>
if [ -f "$STATE_DIR/state" ] && read -r month total last < "$STATE_DIR/state"; then :; else
  month=$MONTH; total=0; last=$now
fi

# The interface counter starts from zero again after a reboot.
if [ "$now" -ge "$last" ]; then delta=$((now - last)); else delta=$now; fi

if [ "$month" != "$MONTH" ]; then
  month=$MONTH; total=0
  if [ -f "$STATE_DIR/tripped" ]; then
    rm -f "$STATE_DIR/tripped"
    $COMPOSE up -d relay
    say "new month $MONTH: relay started again"
  fi
fi
total=$((total + delta))
echo "$month $total $now" > "$STATE_DIR/state.tmp" && mv "$STATE_DIR/state.tmp" "$STATE_DIR/state"

if [ "${1:-}" = status ]; then
  echo "month $month: $((total / 1000000)) MB sent of the ${LIMIT_GB} GB limit"
  if [ -f "$STATE_DIR/tripped" ]; then echo "limit reached: relay stopped until the 1st"; else echo "under the limit"; fi
fi

if [ "$total" -ge "$limit" ]; then
  # Checked on every run: `restart: always` brings the container back after a reboot.
  if [ ! -f "$STATE_DIR/tripped" ] || running; then
    touch "$STATE_DIR/tripped"
    $COMPOSE stop relay
    say "month $month: $((total / 1000000000)) GB sent, limit ${LIMIT_GB} GB reached: relay stopped until the 1st"
  fi
fi
CAP
chmod 755 /usr/local/bin/hemmia-relay-cap

[ -f /etc/hemmia-relay-cap.env ] || echo "LIMIT_GB=3000" > /etc/hemmia-relay-cap.env

cat > /etc/systemd/system/hemmia-relay-cap.service <<'UNIT'
[Unit]
Description=Stop the relay once this month's outbound data reaches the limit

[Service]
Type=oneshot
ExecStart=/usr/local/bin/hemmia-relay-cap
UNIT

cat > /etc/systemd/system/hemmia-relay-cap.timer <<'UNIT'
[Unit]
Description=Check the host's monthly outbound data every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now hemmia-relay-cap.timer
/usr/local/bin/hemmia-relay-cap status
