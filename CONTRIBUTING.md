# Contributing to Hemmia

Thank you for helping. Hemmia is a private AI for families: people trust it with their chats,
so the bar for security and privacy is high. Please read this page before opening a pull
request.

## Before you start

- For anything bigger than a small fix, open an issue first and describe what you want to
  change. That saves you work if the change doesn't fit.
- **Security problems:** don't open an issue. Follow [SECURITY.md](SECURITY.md).

## Running it

You need Node 22 (see `.nvmrc`; `nvm use` picks it up) and npm.

```sh
npm install
npm run dev        # hub server and web app, with hot reload
npm run check      # type check, lint, format check, tests and the website check
```

`npm run check` must pass before a pull request is merged. Useful parts on their own:
`npm run test`, `npm run lint`, `npm run format` (fixes formatting).

- Website: `npm run site:dev`, `npm run site:build && npm run site:preview`.
- Phone app: `npm run mobile:ios` or `npm run mobile:android` (needs Xcode or Android Studio).

The design is described in `docs/public/` (start with `README.md` there) and the security
design in `docs/public/SECURITY.md`.

## Rules for code

These aren't style preferences; a pull request that breaks one will be asked to change.

- **Never log content.** No message text, prompts, chat titles, images, passwords,
  passphrases, recovery codes or tokens in logs, errors or analytics. There are no analytics.
- **Validate at every trust boundary** with zod: request bodies, files read from disk,
  responses from providers and the relay.
- **TypeScript strict**, no `any`. The server runs its TypeScript directly with Node's type
  stripping, so relative imports end in `.ts`, and there are no enums, namespaces or parameter
  properties.
- **No external resources** in the web app or the website: no CDNs, web fonts, analytics or
  embeds.
- **No new dependencies** without discussing them in an issue first. Every dependency is
  something a family has to trust.
- **Crypto and protocol labels never change** (strings like `kchat|v1|` or `kchat-link-v1`):
  they are part of stored data and the wire protocol, even where the product name differs.
- Per-user data stays per user: every query that reads chats, attachments or settings is
  scoped to the signed-in user.
- Changes to authentication, sessions, invites, encryption, rate limits, security headers or
  upload handling get a second review and need tests for the failure cases.

## Commits and sign-off

Commit in small steps with clear messages. Every commit needs a
[Developer Certificate of Origin](https://developercertificate.org/) sign-off, which says
you have the right to contribute the code under the project's licence:

```sh
git commit -s -m "Fix the model list on small screens"
```

## Licence

Hemmia is licensed under the GNU Affero General Public License v3.0 ([LICENSE](LICENSE)). By
contributing you agree that your contribution is licensed the same way.

## Code of conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
