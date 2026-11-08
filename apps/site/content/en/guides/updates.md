---
title: Updating and uninstalling
description: How you hear about a new version, how to install it, and how to remove Hemmia while keeping your data.
nav: guides
order: 85
draft: true
---

# Updating and uninstalling

## Hearing about a new version

Admins see a notice in **Settings → System** when a new version is available, with a link to what's new and how to update.

## Updating on a Mac

Download the new package from the [download page](/download/) and install it like the first time. The installer keeps your data, replaces the program and restarts the hub; the setup doesn't run again. Phones stay connected. Replies that are being written at that moment stop, so update when nobody is chatting.

## Updating with Docker

In the folder `packaging/docker`, get the new version and restart the hub:

```sh
git pull
./start.sh
```

Your data stays in the `hemmia-data` volume. Use the same options as when you started it, for example `./start.sh --no-ollama`.

## Uninstalling on a Mac

Open the Terminal and run:

```sh
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

This removes the program and stops the hub. Your chats and settings stay in `Library/Application Support/Hemmia` in your home folder; delete that folder yourself if you want them gone too.
