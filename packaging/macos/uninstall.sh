#!/bin/bash
# Removes the Hemmia hub (the program and its LaunchAgent). Your data stays where it is.
#   sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
set -eu
if [ "$(id -u)" != "0" ]; then
  echo "Run with sudo." >&2
  exit 1
fi
USER_NAME=$(stat -f %Su /dev/console)
if [ -n "$USER_NAME" ] && [ "$USER_NAME" != "root" ]; then
  USER_ID=$(id -u "$USER_NAME")
  USER_HOME=$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')
  launchctl bootout "gui/$USER_ID/app.hemmia.hub" 2>/dev/null || true
  rm -f "$USER_HOME/Library/LaunchAgents/app.hemmia.hub.plist"
  DATA="$USER_HOME/Library/Application Support/Hemmia"
  [ ! -d "$DATA" ] && [ -d "$USER_HOME/Library/Application Support/kchat" ] &&
    DATA="$USER_HOME/Library/Application Support/kchat"
fi
rm -rf "/Library/Application Support/Hemmia"
pkgutil --forget app.hemmia.hub >/dev/null 2>&1 || true
echo "Hemmia hub removed."
if [ -n "${DATA:-}" ]; then
  echo "Your chats and settings are still in: $DATA"
  echo "Delete that folder yourself if you want them gone too."
  # Ollama that Hemmia installed lives in that folder too; the models are in ~/.ollama, which
  # another Ollama on this Mac may share, so they stay unless the person removes them.
  if [ -d "$DATA/runtime" ] && [ -n "${USER_HOME:-}" ] && [ -d "$USER_HOME/.ollama/models" ]; then
    echo "Downloaded AI models are in: $USER_HOME/.ollama/models"
    echo "Delete them too if no other app on this Mac uses Ollama."
  fi
fi
