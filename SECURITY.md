# Security policy

Hemmia holds people's private conversations, so we take reports seriously and answer them
quickly.

## Reporting a vulnerability

Please **don't** open a public issue. Report privately through GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository, or by
email to <!-- CHECK: security contact address (P8.4/P10.7) -->.

Include what you found, how to reproduce it, and what an attacker could do with it. You
don't need a finished exploit.

What happens next: <!-- CHECK: owner confirms these response times -->

- We confirm we got your report within 3 days.
- We tell you within 14 days whether we can reproduce it and what we plan to do.
- We fix confirmed problems as fast as we can and publish an advisory with the release. If
  you like, we credit you there.

Please give us reasonable time to release a fix before you publish details.

## Supported versions

Security fixes go into the latest release. Please update hubs and apps to the newest version.

## Scope

In scope: the hub (server and web app), the phone apps, the relay (Hemmia Connect) and the
packages in this repository. Especially interesting: reading another person's chats,
getting around sign-in or invites, the relay reading or changing traffic, and anything that
leaks content into logs.

Out of scope: problems that need full control of the hub's computer or of an unlocked phone,
problems in the AI providers' own services, and missing hardening without a concrete attack.

The security design is described in [docs/public/SECURITY.md](docs/public/SECURITY.md).
