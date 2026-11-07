---
title: Away from home
description: Reach your hub from your phones with Hemmia Connect or Tailscale. What the relay can and can't see.
nav: guides
order: 75
draft: true
---

# Away from home

Your hub only answers on its own computer. For your phones, at home and away, choose one of three ways during setup (step **Away from home**) or later in **Settings → System → Remote access**.

| | Hemmia Connect | Tailscale | Not now |
| --- | --- | --- | --- |
| Works | Everywhere | Everywhere | Only in a browser on the hub's computer |
| On each phone | Nothing extra | The Tailscale app and an account | – |
| Who passes the traffic on | Our relay (it can't read it) | Tailscale's network | – |
| Effort | One switch | A few steps, partly in the Terminal | None |

## Hemmia Connect

Turn on **Hemmia Connect**: during setup with **Turn on Connect**, or later with the switch in **Settings → System → Remote access**. Your hub gets its own address, and phones reach it through our relay. Connect also keeps the computer from sleeping.

The connection is encrypted from your phone all the way to your hub. The relay passes it on but doesn't have the keys to open it: it never sees your messages, passphrases or photos. The [privacy page](/privacy/) explains the one thing it could do in theory, and why the certificate logs would show it.

The settings show whether Connect is working, how long the hub's certificate is valid and how much data went through the relay this month. **Forget this address** gives up the address; phones connected through Connect then need a new link.

Each hub can send up to 20 GB a month through the relay; a family typically uses one to three. If a hub ever reaches it, phones can't reach it through Connect until the next month begins (counted in UTC); Tailscale keeps working.

If Connect stops working for ten minutes (the relay is down, or the internet at home), admins get a notification, and another when it works again. The hub keeps trying to reconnect by itself.

## Tailscale

Tailscale is a private network you manage yourself. Every phone needs the Tailscale app and must be signed in to the same network.

<!-- steps -->
## Install Tailscale on the hub's computer
Install Tailscale from [tailscale.com](https://tailscale.com) and sign in.

## Turn on HTTPS certificates
In the Tailscale admin console, open **DNS** and, under **HTTPS Certificates**, choose **Enable HTTPS**.

## Connect Hemmia to Tailscale
On a Mac, open the Terminal and run:

```sh
"/Library/Application Support/Hemmia/current/packaging/tailscale.sh"
```

It publishes the hub inside your Tailscale network only (never on the public internet), restarts it, and shows its new address.

With Docker, run `tailscale serve --bg --https=443 http://127.0.0.1:8787` on the computer, put `HEMMIA_PUBLIC_HOSTNAMES=<name>.ts.net` (its name from `tailscale status`) into `.env` next to `compose.yaml`, and run `docker compose up -d` again.

## Add the phones
Install Tailscale on each phone and sign in to the same network. Then connect the phones to the hub as in [Connect your phone](/guides/phone-to-hub/).
<!-- /steps -->

## Not now

Without remote access, Hemmia works only in a browser on the hub's computer. You can turn on Connect or set up Tailscale at any time later.
