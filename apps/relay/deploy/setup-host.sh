#!/usr/bin/env bash
# One-time setup of a Debian/Ubuntu host for the relay (run as root). Provider-neutral: any VPS
# or machine with a public IPv4 (and optionally IPv6) address works.
# Installs Docker from Docker's apt repository, a firewall allowing SSH and 443, automatic
# security updates, swap on small machines, the /srv/relay directories and a nightly backup
# timer. The monthly traffic cap is separate: traffic-cap.sh.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
. /etc/os-release

# Oracle's Ubuntu images ship a saved iptables ruleset that rejects all inbound traffic except
# SSH; ufw on top of it fights it (Oracle advises against ufw there). Where that ruleset exists,
# 443 is opened in it directly; everywhere else ufw. Override with FIREWALL=iptables|ufw.
if [ -z "${FIREWALL:-}" ]; then
  if [ -f /etc/iptables/rules.v4 ] && grep -q -- '-j REJECT' /etc/iptables/rules.v4; then
    FIREWALL=iptables
  else
    FIREWALL=ufw
  fi
fi
echo "==> Firewall via $FIREWALL"

# A fresh cloud machine often installs security updates first and holds the apt lock.
APT="apt-get -o DPkg::Lock::Timeout=600"
$APT update
if [ "$FIREWALL" = iptables ]; then FW_PACKAGE=iptables-persistent; else FW_PACKAGE=ufw; fi
DEBIAN_FRONTEND=noninteractive $APT install -y ca-certificates curl gnupg unattended-upgrades sqlite3 "$FW_PACKAGE"

# Firewall before Docker, so saving the iptables rules doesn't also save Docker's own chains.
if [ "$FIREWALL" = iptables ]; then
  if ! iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
    # Above the catch-all REJECT, where the rule is actually reached.
    position="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    iptables -I INPUT "${position:-1}" -p tcp --dport 443 -j ACCEPT
  fi
  netfilter-persistent save
else
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

# Small machines (1 GB) need swap to build the image and run Docker comfortably.
if [ ! -f /swapfile ] && [ "$(awk '/MemTotal/ { print $2 }' /proc/meminfo)" -lt 2000000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
$APT update
$APT install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
dpkg-reconfigure -f noninteractive unattended-upgrades

# Logs hold shortened IP addresses and hub ids: at most 14 days (privacy policy, RELAY.md §10).
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/hemmia-retention.conf <<'CONF'
[Journal]
MaxRetentionSec=14day
CONF
systemctl restart systemd-journald
journalctl --vacuum-time=14d
for file in /etc/logrotate.d/rsyslog; do
  [ -f "$file" ] || continue
  sed -i -E 's/^(\s*)(weekly|monthly)$/\1daily/; s/^(\s*)rotate [0-9]+$/\1rotate 14/' "$file"
done
find /var/log -maxdepth 2 -name 'syslog.*' -mtime +14 -delete

install -d -m 0700 /srv/relay /srv/relay/data /srv/relay/backup /srv/relay/secrets
# The container runs as uid 10002.
chown 10002:10002 /srv/relay/data
install -m 0755 "$(dirname "$0")/backup.sh" /srv/relay/backup.sh
install -m 0644 "$(dirname "$0")/compose.yaml" /srv/relay/compose.yaml

cat > /etc/systemd/system/relay-backup.service <<'UNIT'
[Unit]
Description=Back up the relay database
[Service]
Type=oneshot
ExecStart=/srv/relay/backup.sh
UNIT
cat > /etc/systemd/system/relay-backup.timer <<'UNIT'
[Unit]
Description=Nightly relay backup
[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now relay-backup.timer
echo "Done. Put relay.env (and apns.p8, fcm.json when push is set up) into /srv/relay/secrets (0600)."
