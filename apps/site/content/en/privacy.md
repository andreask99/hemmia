---
title: Privacy and security, explained
description: What stays on your devices, what goes to an AI provider, what our relay sees, and what this website keeps.
nav: privacy
order: 20
---

# Privacy and security, explained

This page says in plain words what happens to your data. The technical details are in the [security design](https://github.com/andreask99/hemmia/blob/main/docs/SECURITY.md), published with the source code. The binding details are in our [Privacy Policy](/legal/privacy/).

## What stays on your devices

- **At home:** your chats, photos and documents are stored on your hub. Each person's content is encrypted with a key that comes from their own passphrase, so other family members, and the hub's admin account, can't read it. If you forget your passphrase, your recovery code gets you back in.
- **On your phone:** your chats and photos are stored in the app, encrypted with a key that only the phone's secure storage holds.
- There is no Hemmia account and no server of ours that keeps your chats.

**One limit:** while you use Hemmia, the hub has to decrypt your messages to answer them. Someone with full control of the hub's computer at that moment (not just the admin account) could in theory read them. The encryption protects what is stored, and protects each person from the others.

## What goes to an AI provider, and when

- **Local models** run on your hub. What you write to them never leaves your house.
- **Cloud models** (Anthropic, OpenAI and others) get the messages of the chats you have with them, because they write the answers. That happens only with a key you added yourself, and only for chats where you picked one of those models. On a hub, your key is stored encrypted with your passphrase; nobody else, not even the admin, can see or use it. The provider's own privacy terms apply to what they receive.
- On the phone, the app talks directly to the provider. Your key is kept in the phone's secure storage and is only ever sent to that provider.

## What our relay sees (Hemmia Connect)

If you turn on Hemmia Connect, phones reach your hub through our relay when they're away from home.

- The connection is encrypted from your phone to your hub. The relay passes it on, but it does not have the keys to open it. It never sees your messages, passphrases, photos or which chat you're in.
- It does know: your hub's address, when it was last connected, how much data passed through it this month, and, while a connection is open, the connecting phone's IP address, which it also passes to your hub so the hub can block password guessing. Logs keep IP addresses only shortened.
- **The one thing it could do in theory:** whoever runs the relay controls the addresses under its domain, so they could in theory get a certificate for your hub's address and intercept connections while they do so. That is the same trust you place in any website's security. Every such certificate is published in public logs, where it can be seen. If you'd rather not extend that trust, use **Tailscale** instead, or use the hub only in a browser on its own computer.

## Notifications

When a reply or a picture is ready, your phone gets a notification. It carries no content: the text you see ("Your reply is ready") comes from the app itself, and the reference to the chat is encrypted by your hub, so neither Apple nor our relay can tell which chat it belongs to.

## Update check

Once a day, a hub installed from our package or Docker image asks our server whether a newer version exists. That request says only which version it runs, whether it's the Mac or the Docker version, and whether it follows normal or test releases. We count these requests per day, so we know roughly how many hubs run which version. We don't store your IP address, and nothing about you or your family is sent. The answer is signed, so your hub only trusts it if it really comes from us. With Docker, you turn the check off by setting `HEMMIA_UPDATE_CHECK=0` in `.env`. On a Mac, a switch in the settings is planned; until then, write to us and we'll tell you how.

## This website

No cookies, no analytics, no tracking pixels, no fonts or scripts from other sites. The server that hosts the files may keep standard access logs; we don't use them to follow anyone.

## Open source

Hemmia's code is [published on GitHub](https://github.com/andreask99/hemmia) under the AGPL licence, so that anyone can check what it does. If you find a security problem, please report it privately, through [GitHub's private reporting](https://github.com/andreask99/hemmia/security/advisories/new) or to andreas.apps@icloud.com, and we'll fix it as quickly as we can.

The binding details are in our [Privacy Policy](/legal/privacy/) and [Terms of Use](/legal/terms/).
