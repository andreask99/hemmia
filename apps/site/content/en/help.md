---
title: Troubleshooting
description: What to do when the hub isn't reachable, a setup link expired, you forgot your passphrase, a model is slow or a key is refused.
nav: help
order: 90
---

# Troubleshooting

## The app says the hub isn't reachable

The app shows what to check and when it last reached the hub from this phone.

- Is the computer switched on and awake? A Mac that goes to sleep can't answer.
- Does it have internet?
- Is Hemmia Connect or Tailscale on? Phones reach the hub only through one of them, at home too: see [How it works](/how-it-works/).

Tap **Try again** once the computer is back, or **Switch to another hub** to open a different hub.

## The setup link doesn't work

The setup page needs the link the installer opened. If it says **Open the setup link from the installer**, open the page from the installer again. A setup link is valid for 24 hours. On a Mac, run the installer again: it restarts Hemmia and opens the setup page with a new link (or the current one, if it is still valid). With Docker, run `docker compose restart hub` and open the new link from `docker compose logs hub`.

## I forgot my passphrase

On the sign-in page, tap **Forgot your passphrase?** and enter your username, your recovery code and a new passphrase. You then get a new recovery code; the old one no longer works. Write the new one down.

<!-- note -->
Nobody else can reset your passphrase, not even an admin: your chats are encrypted with it. Without the passphrase and the recovery code, your account can't be opened again. An admin can then **Disable** the old account in **Settings → Family** and invite you again: you start with a new, empty account under a different username.
<!-- /note -->

## A model is very slow

Local models run on the hub's computer, and big models need a lot of memory. In **Settings → Models**, Hemmia marks the models that fit your computer; pick a smaller one, or use a cloud model for long or difficult questions. See [Choosing AI models](/guides/models/).

## My key is refused

- **This key was refused:** check that you copied all of it, with no space at the start or end. If it still fails, create a new key in the provider's console.
- **Your key has reached its limit for now:** you've reached the provider's rate limit or your spending limit. Try again later, or raise the limit in the provider's console.
- **The provider is busy:** try again in a minute.

## Notifications don't arrive

Check that notifications for Hemmia are allowed in the phone's Settings, and that the hub is connected to the internet. Notifications come from the hub, so they arrive only while it is switched on.

## Contact

Still stuck? Write to [andreas.apps@icloud.com](mailto:andreas.apps@icloud.com), in English, German, French or Italian. Say which device and which version you use (in the app's settings); never send your passphrase, recovery code or keys.
