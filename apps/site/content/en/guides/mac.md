---
title: Set up Hemmia on a Mac
description: Install the hub on a Mac with Apple silicon, set it up in your browser and connect your phone.
nav: guides
order: 20
---

# Set up Hemmia on a Mac

The hub is the computer at home that runs Hemmia for your family. A Mac works well: it is quiet, uses little power, and Macs with Apple silicon run local AI models fast.

## What you need

- A Mac with Apple silicon (M1 or newer) and macOS 14 or later.
- 8 GB of memory runs a small local model; 16 GB or more is better, and pictures need 24 GB. Cloud models work with any Mac.
- About 10 GB of free disk space for a local model, and 6 GB more for pictures.
- The Mac should stay on. Hemmia keeps it from sleeping while phones need to reach it.

<!-- steps -->
## Download and install
Download the Hemmia hub package from the [download page](/download/) and open it. The installer asks for your Mac password, because the program goes into the system's Application Support folder.

## Set up in the browser
When the installer finishes, your browser opens the Hemmia setup. Give your family a name, create your own account and write down the recovery code. If you closed the page or waited more than a day, run the installer again: it opens the setup with a fresh link.

<!-- screenshot name="mac-setup-welcome" alt="The first setup step: welcome to Hemmia, with the memory and disk space of this Mac and a field for the family name" -->


## Choose your AI
Hemmia recommends a local model that fits this Mac: download it, add a cloud key, or both. If Ollama isn't installed yet, **Install Ollama** does it for you. Here you can also **Turn on pictures** and **Turn on web search**. You can change all of this later in Settings → Models.

<!-- screenshot name="mac-setup-models" alt="The model list in setup: recommended local models with their download size, some already downloaded" -->


## Make it reachable for phones
Phones reach the hub only through Hemmia Connect or Tailscale, at home too. Turn on Connect, or choose Tailscale and follow [Away from home](/guides/remote/). With "Not now", Hemmia works only in a browser on this Mac.

<!-- screenshot name="mac-setup-remote" alt="The choice between Hemmia Connect (recommended), Tailscale and Not now" -->


## Add your phone
Install the Hemmia app on your phone, tap **Scan the code** and scan the code on the Mac's screen. Your phone signs in as you. More phones: [Connect your phone](/guides/phone-to-hub/).

<!-- screenshot name="mac-setup-phone" alt="The last setup step: a QR code that signs the phone in" -->

<!-- /steps -->

<!-- note -->
Local models run with [Ollama](https://ollama.com). If this Mac doesn't have it yet, the model step offers **Install Ollama**: Hemmia downloads it, checks it and starts it for you. If you already use the Ollama app, Hemmia uses that one. Cloud models work without Ollama.
<!-- /note -->

## Where your data lives

Your chats and settings are stored in your user's Library: `~/Library/Application Support/Hemmia`. Keep that folder in your backups (Time Machine includes it); see [Backups and recovery](/guides/backup/).

## Uninstalling

Run this in Terminal:

```
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

It removes the program and keeps your data folder, and tells you where it is. Updates: [Updating and uninstalling](/guides/updates/).
