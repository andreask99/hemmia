<p align="center"><img src="apps/site/public/press/hemmia-ghost.svg" width="96" alt=""></p>

# Hemmia

A private AI for you and your family, at home. Hemmia runs on your own computer or simply on
your phone, with local models or your own OpenAI or Anthropic key. Your chats live on your
devices; the people who make Hemmia can't see them and don't collect anything.

<!-- CHECK: website link and store badges (P8.5) -->

## Two ways to use it

- **Hemmia on your phone:** the app on its own, with your own Anthropic or OpenAI key. No
  account, nothing to install at home; chats stay on the phone.
- **Hemmia at home:** a hub on a Mac (installer package) or with Docker. Local models through
  Ollama or LM Studio, cloud models with each person's own key, an account per person with
  their own encryption, phones joined by QR code, and remote access through Hemmia Connect
  (a relay that can't read the traffic) or Tailscale.

## What's in this repository

| Path | What it is |
| --- | --- |
| `apps/server` | The hub: Node 22 and Fastify, SQLite, per-user encryption |
| `apps/web` | The hub's web app (React) |
| `apps/mobile` | The phone app (Capacitor) with phone mode |
| `apps/relay` | Hemmia Connect, the relay for remote access |
| `apps/site` | The website |
| `packages/*` | Shared types, the AI provider clients, the relay protocol, UI components |
| `packaging/` | The macOS package and the Docker setup |
| `docs/public/` | Design, security model and plans |

## Getting started

- **Use it:** see the guides on the website. <!-- CHECK: website link -->
- **Docker:** `packaging/docker/README.md`.
- **Develop:** Node 22 and npm, then `npm install`, `npm run dev` and `npm run check`. See
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

How Hemmia protects your data is described in
[docs/public/SECURITY.md](docs/public/SECURITY.md). Please report vulnerabilities privately as
described in [SECURITY.md](SECURITY.md).

## Licence

GNU Affero General Public License v3.0, see [LICENSE](LICENSE).
