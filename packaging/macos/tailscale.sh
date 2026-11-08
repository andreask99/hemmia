#!/bin/bash
# Makes the Hemmia hub reachable in your Tailscale network (no sudo needed):
#   "/Library/Application Support/Hemmia/current/packaging/tailscale.sh"
# Needs the Tailscale app, signed in, with HTTPS certificates turned on for the tailnet
# (Tailscale admin console → DNS → HTTPS Certificates). Publishes the hub only inside the
# tailnet with `tailscale serve`; never Funnel (the public internet).
set -eu
APP="/Library/Application Support/Hemmia/current"
DATA="$HOME/Library/Application Support/Hemmia"
# A hub set up before the rename keeps its folder.
[ ! -d "$DATA" ] && [ -d "$HOME/Library/Application Support/kchat" ] &&
  DATA="$HOME/Library/Application Support/kchat"
TS=$(command -v tailscale || true)
[ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] &&
  TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if [ -z "$TS" ]; then
  echo "Tailscale isn't installed. Install it from tailscale.com and sign in first." >&2
  exit 1
fi

# This computer's name in the tailnet, e.g. mini.tail1234.ts.net.
NAME=$("$TS" status --json | "$APP/node/bin/node" -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let n = "";
    try { n = String(JSON.parse(s)?.Self?.DNSName ?? ""); } catch {}
    n = n.replace(/\.$/, "").toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n)) process.exit(1);
    process.stdout.write(n);
  });') || {
  echo "Tailscale isn't signed in, or has no name for this computer yet." >&2
  exit 1
}

"$TS" serve --bg --https=443 http://127.0.0.1:8787
mkdir -p "$DATA"
printf '%s\n' "$NAME" > "$DATA/public-hostnames.txt"
chmod 600 "$DATA/public-hostnames.txt"
launchctl kickstart -k "gui/$(id -u)/app.hemmia.hub"
echo "Hemmia is now reachable in your tailnet at https://$NAME"
echo "Install Tailscale on each phone and sign in to the same network."
