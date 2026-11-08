---
title: Privacy Policy
description: How Hemmia's apps, Hemmia Connect, the update check and this website handle personal data, under the Swiss FADP and the EU GDPR.
nav: legal
order: 900
date: 2026-11-08
---

# Privacy Policy

Last updated: 8 November 2026 · Applies to the Hemmia apps, the Hemmia hub software as we distribute it, Hemmia Connect (our relay), the update check and this website (hemmia.app).

<!-- note -->
**The short version**

- **No account with us.** You never sign up with us to use Hemmia. We don't ask for your name, email address or phone number.
- **Your chats are not stored with us.** They live on your own Hemmia hub (a computer at home) or on your phone, encrypted. We never receive them.
- **Hemmia at home is your own system.** Whoever runs a hub decides what happens on it; we don't operate it and can't see into it.
- **On the phone alone, you choose an AI provider** (Anthropic or OpenAI) and use your own key. The app asks for your permission first; your messages then go from your phone to that provider, under your own account with them, not through us.
- **Hemmia Connect** passes encrypted connections between your phones and your hub. We don't read them, and couldn't without leaving a public trace (section 4). To work, it keeps a random hub ID, a monthly byte count, notification addresses (encrypted) and shortened IP addresses in logs for 14 days.
- **The update check** tells us only a version number, Mac or Docker, and the release channel. We count these per day; we don't store your IP address.
- **No ads, no tracking, no analytics**, no selling or sharing of data for marketing, no profiling, no training of AI models on your data.

The rest of this policy gives the details, as required by the Swiss Federal Act on Data Protection (FADP) and the EU General Data Protection Regulation (GDPR).
<!-- /note -->

## Contents

1. Who is responsible
2. How Hemmia is built, and who is responsible for what
3. The Hemmia app on your phone
4. Hemmia Connect (our relay)
5. Notifications
6. The update check
7. Certificates for your hub's address
8. What we never do
9. Phone permissions
10. Who else receives data
11. Countries data goes to
12. How long we keep data
13. Your rights
14. Children and teenagers
15. Security
16. This website
17. Changes to this policy

## 1. Who is responsible

The controller responsible for the processing described in this policy is:

Andreas Kalkum\
Burgstrasse 21\
5634 Merenschwand\
Switzerland\
Email: andreas.apps@icloud.com

Hemmia is made by one person, so there is no separate data protection officer. Write to the address above with any privacy question or request, in English, German, French or Italian.

## 2. How Hemmia is built, and who is responsible for what

Hemmia has three parts, and responsibility follows who runs them:

- **The Hemmia hub** is software you install on your own computer (a Mac, or any computer with Docker). It stores your family's accounts, chats, photos, documents and settings on that computer, encrypted per person. **We don't run your hub and have no access to it.** The person who runs a hub (the "admin") is responsible for the personal data of the people who use it, for example the family members they invite. When the hub uses a cloud AI model, searches the web, opens a web page, downloads a model or sends a notification to a browser, it does so from that computer, on the admin's behalf, under the settings they choose. This policy describes the software so you know what it does; it is not a promise about how a particular admin runs their hub.
- **The Hemmia app** runs on your phone. It either connects to a hub (section 3.1) or works on its own with an AI provider you choose (section 3.2).
- **Our services**: Hemmia Connect (section 4), notifications through the relay (section 5), the update check (section 6) and this website (section 16). For these, we are the controller.

## 3. The Hemmia app on your phone

### 3.1 With a hub

When you connect the app to a hub (by scanning a code or opening a link), the app shows that hub's pages. Your messages, photos and documents go from your phone to the hub, encrypted (HTTPS), either directly (at home, or over Tailscale) or through Hemmia Connect (section 4). The app stores on your phone: the list of hubs you added, your sign-in (a session cookie for each hub) and your settings. None of this is sent to us.

### 3.2 On its own ("Just me, on this phone")

You choose Anthropic or OpenAI and paste an API key from your own account with that provider.

- **Your key** is stored in your phone's secure keychain. It is never sent to us. The app uses it only to talk to the provider you chose.
- **Before anything is sent**, the app asks for your explicit permission: what you write, and photos you add, are sent to that provider to get answers. If you don't agree, nothing is sent and the app can't answer.
- **Your chats** are stored on your phone, encrypted. When you send a message, the app sends the conversation so far (and any photos in it) from your phone directly to the provider. This is processing under **your own contract** with that provider (their terms for API customers) and **their privacy policy**; we don't receive this data and have no access to it. Anthropic: anthropic.com/legal/privacy. OpenAI: openai.com/policies/privacy-policy. Their terms for API customers also say how long they keep what is sent.
- **Export and delete:** you can export your chats to a file on your phone, and delete everything in the app's settings.

Legal basis for what the app does on your phone: providing the app you chose to use (Art. 6(1)(b) GDPR). Sending your messages to the provider: your consent (Art. 6(1)(a) GDPR), which you can withdraw by deleting the key or the app.

### 3.3 What the app stores on your phone

The hub list, sign-ins, settings, your API key and the key that encrypts your chats on the phone are stored on your phone because the features you use need them (Art. 6(1)(b) GDPR, and the exception for strictly necessary storage under the EU ePrivacy rules and Art. 45c of the Swiss Telecommunications Act). Deleting the app removes them.

## 4. Hemmia Connect (our relay)

Hemmia Connect lets your phones reach your hub from anywhere, without opening your router. The admin switches it on in the hub's settings. Our relay server is hosted by Oracle Cloud Infrastructure in Zurich, Switzerland.

**What the relay can't see.** The connection between your phone and your hub is encrypted from end to end (TLS). The certificate's private key exists only on your hub. The relay passes the encrypted data on without being able to read it: no messages, passphrases, photos or documents. Because we manage the domain, we could in theory obtain another certificate for your hub's address; every certificate is published in public Certificate Transparency logs, so this could not happen unnoticed, and we don't do it. If you'd rather not rely on this, use Tailscale (section 3.1).

**What the relay processes, and why:**

| Data | Purpose | Legal basis |
| --- | --- | --- |
| Your hub's random ID (12 characters, e.g. `k7m2pq9xz4hr`) and its public key | To give your hub its address (`<id>.h.hemmia.app`) and recognise it | Contract with the admin (Art. 6(1)(b) GDPR) |
| The IP address at registration, shortened (the last part removed, e.g. `203.0.113.0/24`), and times of registration and last connection | To limit abuse (registrations per network) and delete unused hubs | Legitimate interest in a secure service (Art. 6(1)(f) GDPR) |
| For each connection to a hub: the connecting device's IP address, the hub's address, the time and the amount of data | Necessarily processed to pass the connection on. The full IP address is also passed to your hub, so that it can limit sign-in attempts; what the hub does with it is up to its admin (section 2). Only the shortened IP address, the hub ID, the byte count and the duration are written to our logs | Legitimate interest in providing and securing the connection the admin asked for (Art. 6(1)(f) GDPR); contract with the admin |
| Your hub's own IP address while it is connected | Used only to keep the connection and answer the hub's requests; not stored | Contract with the admin |
| The amount of data per hub per month | To apply the monthly limit (20 GB per hub) | Contract with the admin |
| Certificate requests (they contain only the hub's address) | To get the hub's certificate (section 7) | Contract with the admin |

The relay does not record who uses a hub, which pages are opened, or what is said.

**Switching Connect off or forgetting the address.** Switching Connect off stops all connections. **Forget this address** in the hub's settings deletes the hub's registration on the relay. A hub that hasn't connected for 12 months is deleted automatically.

**Blocking.** If a hub breaks the terms of use, for example to serve something other than Hemmia, we can block it (see the terms of use). A blocked hub's registration (ID, public key, shortened IP address and times), a short reason and the time of the block are kept so the same key can't register again. We review blocks at least once a year.

## 5. Notifications

Notifications tell you that an answer or a picture is ready, or that it's time for your morning brief. They never contain your chats: the text you see ("Your reply is ready") comes from the app or the browser itself.

- **In a browser** (Hemmia added to the home screen): the hub sends the notification directly to your browser's push service (for example Apple's for Safari). That is the hub's processing (section 2), not ours.
- **In the iPhone app** with a hub that uses Connect: iOS gives the app a device token. The app sends it to your hub, and the hub registers it on our relay. The relay stores it **encrypted**, with the platform and the times it was created and last used, and gives the hub only a random handle in return. When the hub wants to notify you, the relay sends Apple's Push Notification service the device token, the kind of notification (for example "reply"), your hub's address (so the app knows which hub to open) and an opaque reference that only your hub can resolve. To limit abuse, the relay keeps a list of recent notifications per hub (hub ID, a hash of the handle, the time) for one day.

Legal basis: providing the notifications you switched on (Art. 6(1)(b) GDPR). The iOS permission, which you can withdraw at any time in the iOS Settings, decides whether they are shown.

Hemmia is not yet available for Android. Before the Android app is released, Google (Firebase Cloud Messaging), which would deliver its notifications, will be added to this policy.

## 6. The update check

Hubs installed from our Mac package or Docker image check once a day for a newer version. The request goes to our relay and contains only the hub's version (for example `0.1.0`), the platform (`mac` or `docker`) and the channel (`stable` or `beta`). Our server counts these requests per day, version, platform and channel. It uses your IP address only in memory, to count one address at most three times a day, and never stores or logs it. The answer is signed, so your hub only acts on information that really comes from us.

The counts tell us roughly how many hubs run which version; they contain no personal data. Legal basis for the short processing of the IP address: our legitimate interest in keeping hubs up to date and knowing which versions are in use (Art. 6(1)(f) GDPR). The admin can turn the check off; the hub then sends nothing. With Docker: set `HEMMIA_UPDATE_CHECK=0` in the `.env` file next to `compose.yaml` (see the Docker guide). On a Mac, a switch in the settings is planned; until then, write to us and we'll tell you how to turn it off.

## 7. Certificates for your hub's address

So that your phone can trust your hub's address, the relay asks the certificate authority Let's Encrypt (Internet Security Research Group, USA) for a certificate for that address. To prove the address is ours, the relay puts a temporary record into our DNS at Cloudflare. Let's Encrypt publishes every certificate it issues in public Certificate Transparency logs, as all public certificate authorities must. Your hub's address therefore appears in those logs. It consists of a random ID and says nothing about you; it is not linked to your name anywhere.

## 8. What we never do

- No advertising, and no advertising, analytics or tracking software in the apps, the hub or on this website.
- No tracking across apps or websites, and no use of Apple's advertising identifier.
- No selling, renting or sharing of personal data for marketing.
- No profiling and no automated decisions that affect you (Art. 22 GDPR, Art. 21 FADP).
- No use of your chats, photos or other content to train AI models, by us or on our behalf.
- No access to your chats, ever: they are not on our servers.

If you have chosen in iOS to share analytics with app developers, Apple may give us crash reports and aggregated usage statistics. These don't identify you. This is controlled by Apple in your iOS settings, not by the app. Legal basis: the consent you gave Apple in iOS (Art. 6(1)(a) GDPR) and our legitimate interest in fixing errors (Art. 6(1)(f) GDPR).

## 9. Phone permissions

| Permission | Used for | If you say no |
| --- | --- | --- |
| Camera | Scanning the code that connects the app to a hub; taking photos you add to a chat | Paste the link instead; pick photos from your library |
| Notifications | Knowing when an answer or a picture is ready, and the morning brief | Open the app to see new answers |

Photos you pick from your library are given to the app one at a time by iOS. You can change these at any time in the iOS Settings.

## 10. Who else receives data

We pass data only to the following recipients, and only as described above:

| Recipient | Role and data | Location |
| --- | --- | --- |
| Oracle (Oracle Cloud Infrastructure) | Processor that hosts our relay (sections 4–6) | Zurich, Switzerland |
| Cloudflare | Processor for our domain's DNS (including the temporary certificate records, section 7) and for hosting this website (section 16): IP addresses and technical request data | Global network, including the USA |
| Let's Encrypt (Internet Security Research Group) | Independent certificate authority: your hub's address, published in Certificate Transparency logs | USA |
| Apple | Delivers notifications to the iPhone app (device token, kind of notification, hub address, opaque reference) and runs the App Store, as an independent controller; also hosts our email (iCloud Mail), as our processor | Global, including the USA |
| Anthropic or OpenAI | Only if you use the app on its own and choose them: your messages and photos, under your own account with them (section 3.2). We don't receive this data and have no access to it; the provider processes it under your contract with them. | USA and elsewhere, under their policies |

We may disclose data if we are legally obliged to, for example to a court or authority. Given how little we hold, there is usually very little we could disclose. We can never disclose chats: we don't have them.

## 11. Countries data goes to

Our relay and its data are in Switzerland. Some processing by Cloudflare, Let's Encrypt and Apple can take place in the USA. Cloudflare, Inc. and Apple Inc. are certified under the EU–US Data Privacy Framework and the Swiss–US Data Privacy Framework, which the European Commission and the Swiss Federal Council have recognised as providing adequate protection; Cloudflare's data processing terms also include the EU Standard Contractual Clauses, as adapted for Switzerland. Let's Encrypt receives only your hub's random address, which it publishes by design; this transfer is necessary to provide Connect as the admin requested (Art. 49(1)(b) GDPR, Art. 17(1)(b) FADP).

## 12. How long we keep data

| Data | Deleted |
| --- | --- |
| Hub registration (ID, public key, shortened IP address, times) | When the admin uses **Forget this address**; otherwise 12 months after the hub last connected. Blocked hubs: kept as long as the block is needed, reviewed at least once a year. |
| Monthly byte count per hub | After 3 months |
| Certificate requests | After 7 days |
| Notification device tokens (encrypted) | When the hub or the app removes them, or after 90 days without use |
| Notification rate list | After 1 day |
| Relay logs (shortened IP addresses, hub IDs, byte counts) | After 14 days at the latest |
| Update-check counts | Kept; they contain no personal data |
| Content of connections through the relay | Never stored |
| Everything on your hub or phone | Under your control; we have no copy |

The relay's database is backed up nightly, on the relay server (kept 7 days) and on a computer of ours in Switzerland (kept 30 days). Deleted data can remain in a backup for up to 30 days before it is overwritten. Backups are readable only by us.

## 13. Your rights

Under the GDPR and the Swiss FADP you have the right to:

- access the personal data we hold about you (Art. 15 GDPR, Art. 25 FADP);
- have incorrect data corrected (Art. 16 GDPR, Art. 32 FADP);
- have your data erased (Art. 17 GDPR, Art. 32 FADP);
- have processing restricted (Art. 18 GDPR);
- receive your data in a portable format (Art. 20 GDPR, Art. 28 FADP);
- withdraw your consent at any time with effect for the future, for example by deleting your key in the app (section 3.2) (Art. 7(3) GDPR);
- lodge a complaint with a data protection supervisory authority. In Switzerland this is the Federal Data Protection and Information Commissioner (FDPIC, edoeb.admin.ch). In the EU, it is the authority in the country where you live or work, or where an alleged infringement took place.

**Right to object (Art. 21 GDPR):** where we process your data on the basis of our legitimate interests (sections 4, 6, 8 and 16), you can object at any time, on grounds relating to your particular situation. We then stop, unless we can demonstrate compelling legitimate grounds that override your interests, rights and freedoms, or the processing serves the establishment, exercise or defence of legal claims.

Write to andreas.apps@icloud.com to exercise these rights. We respond within one month at the latest (30 days under the FADP). Exercising your rights is free.

**A practical note:** because Hemmia has no accounts with us, an email doesn't tell us which records are yours. For Connect, the admin of your hub can see the hub's address in **Settings → System**; send us that address and we can find its records. The quickest way to delete them is **Forget this address** in the same place. If we cannot identify you with reasonable certainty, we will tell you (Art. 11 and 12(2) GDPR). We will never ask for more personal data than is needed for this.

For data on a hub, ask the person who runs it: they hold it, not us. For data you sent to Anthropic or OpenAI, ask that provider.

## 14. Children and teenagers

The Hemmia app is intended for people aged 13 and over. On a hub, the admin decides who gets an account and can create teen accounts, which see only the models the admin allows, search the web with strict safe search or not at all, and can't create pictures. Parents are responsible for their children's use of a hub they run. Using the app on its own requires an account with Anthropic or OpenAI, whose own age rules apply. Anthropic, for example, requires its API customers to be at least 18, so on its own the app is in practice for adults; teenagers can use a hub that a parent runs. If you are under the age at which you may agree to data processing yourself in your country (in the EU between 13 and 16, depending on the country), please use Hemmia only with the permission of a parent or guardian. Hemmia is not directed at children under 13. Parents who believe their child under 13 uses the app on its own can delete everything in the app's settings or contact us.

## 15. Security

We protect data with technical and organisational measures appropriate to the risk, including:

- encryption in transit for all connections (TLS), and end-to-end encryption between your phone and your hub through the relay;
- encryption at rest: chats on a hub are encrypted with a key that only the person's passphrase (or recovery code) unlocks; in the app they are encrypted on the phone; device tokens on the relay are encrypted;
- devices must be paired with a hub before they can reach it through the relay;
- shortened IP addresses in logs, short retention and automatic deletion;
- signed updates information, so a hub only trusts what we published;
- rate limits and the option to block hubs that misuse the relay.

No system is completely secure. If a data breach is likely to put you at risk, we will inform the competent authorities and, where required, you.

## 16. This website

This website uses no cookies, no analytics, no tracking and no externally loaded fonts or scripts. It is hosted by Cloudflare (Cloudflare Pages). To deliver the pages, Cloudflare necessarily processes your IP address and the technical data your browser sends, such as the browser type and the page requested, and may keep them in short-lived logs for security. We do not receive or evaluate access logs. Legal basis: our legitimate interest in delivering the website securely (Art. 6(1)(f) GDPR). If you email us, we use your email address and message only to answer you or handle your report, and we delete them when the matter is settled unless we are legally required to keep them. Legal basis: our legitimate interest in answering you and handling reports (Art. 6(1)(f) GDPR), or steps you ask for under a contract (Art. 6(1)(b) GDPR).

## 17. Changes to this policy

If we change how Hemmia handles data, we will update this policy and the date at the top. Significant changes will be announced in the app or on the hub before they take effect. When Hemmia Connect is offered as a paid service, the payment provider and what it processes will be added here before the first sale. The current version is always at hemmia.app/legal/privacy/, in German at hemmia.app/de/legal/privacy/. Both say the same; if they ever differ, the English version applies.
