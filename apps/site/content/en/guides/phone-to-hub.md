---
title: Connect your phone
description: Connect the Hemmia app to your hub with a QR code, sign in more devices, and switch between hubs.
nav: guides
order: 60
draft: true
---

# Connect your phone

The Hemmia app connects to your hub with a QR code. Your phone then signs in as you, so there's no passphrase to type on the phone.

## During setup

The last step of the hub's setup, **Add your phone**, shows a QR code. Open the Hemmia app on your phone, tap **Scan the code** and point the camera at it.

## Later, or another device

<!-- steps -->
## Open your account settings
On a device that is already signed in, open **Settings → Account** and find **Sign in another device**.

## Show the code
Enter your passphrase and tap **Show sign-in code**. The code works once, for 10 minutes.

## Scan it
In the Hemmia app on the other phone, tap **Scan the code**. On a computer, or to use Hemmia in the phone's browser, tap **Copy** next to the link instead and open it in the browser there.
<!-- /steps -->

If the page says the computer has no address other devices can reach yet, turn on Hemmia Connect or set up Tailscale first: see [Away from home](/guides/remote/).

Admins can also add a device for someone else: **Settings → Family**, then **Devices** next to the person and **Add a device for …**. That code is valid for 24 hours. To give someone a new account, use an invite instead: see [Invite your family](/guides/family/).

## What "connected" means

Once connected, the app opens your hub directly. When the hub can't be reached, the app says so and shows what to check: whether the computer is on and awake, and whether it has internet. Your chats are on the hub, so they aren't shown while it is unreachable.

<!-- screenshot name="phone-chat" alt="A chat from the hub on a phone" -->

## More than one hub

The app can keep several hubs, for example yours and your parents'. **Add another hub** in the list of hubs adds one; **Switch hub** in a hub's settings goes back to the list. If you also use the app on its own, **On this phone** is the first row of that list.

## Without the app

Hemmia also works in the phone's browser. Open the copied link in Safari (or Chrome on Android), then add it to the home screen: in Safari, **Share → Add to Home Screen**. Turn on notifications there under **Settings → Account → Notifications**.

## Removing a phone

In **Settings → Account → Devices**, remove a phone you no longer use or have lost. It is signed out at once and needs a new code to come back.
