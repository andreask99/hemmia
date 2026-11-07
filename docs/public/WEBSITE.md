# Website: what Hemmia is and how to set it up

Read [README.md](README.md) first. The website explains Hemmia, guides people through setup and
is the home for downloads, privacy texts and the press kit. **For now it is built and served
locally**; where it is hosted is decided later (§9). Tasks: P10 in [PLAN.md](PLAN.md).
Messages and tone come from [MARKETING.md](MARKETING.md).

The website uses the name **Hemmia** from the start (an exception to the "keep `kchat` until
P8.2" rule, because the site exists only for the launch). It is not published anywhere before
the name checks of P8.1 pass.

## 1. Rules

- **Static files only.** No server code, no forms, no cookies, no accounts, no comments.
- **No external resources** (same rule as the web app): fonts, images and scripts are served
  from the site itself. No analytics, no tracking pixels, no embedded videos from other sites,
  no CDN. Links to other sites (GitHub, app stores, providers) are fine.
- **Works without JavaScript.** JavaScript is allowed only for small enhancements (the mobile
  menu toggle, copy buttons on commands); everything must be readable and navigable without
  it.
- Bilingual: English at `/`, German at `/de/`. Every page exists in both languages, and each
  page links to its counterpart.
- Accessible: semantic HTML (one `h1` per page, landmarks, skip link), text contrast at least
  4.5:1, visible focus, images with `alt`, respects `prefers-reduced-motion`, light and dark
  (`prefers-color-scheme`).
- Fast: under 200 KB per page excluding screenshots; screenshots as WebP with explicit width
  and height and `loading="lazy"` below the fold.
- Same look as the app: colours and fonts from the web app (`apps/web/src/index.css`
  variables, Fraunces and Manrope from `apps/web/src/fonts/`, OFL licences shipped with
  them), the house ghost from P8.1 as the mascot.

## 2. Technology

- New workspace **`apps/site`** (`@hemmia/site`, renamed in P8.2). Only approved packages:
  `vite`, `react`, `react-dom`, `react-markdown`, `remark-gfm`, `tailwindcss`,
  `@tailwindcss/vite`, `vitest`.
- **Content is Markdown** in `apps/site/content/{en,de}/<page>.md`, so pages can be written and
  reviewed as text. Each file starts with a small header block parsed by the site's own code
  (not YAML: a fixed format, validated with zod):
  ```
  ---
  title: Set up Hemmia on a Mac
  description: Install the hub on a Mac with Apple silicon and connect your phone.
  nav: guides
  order: 20
  ---
  ```
- **Build = prerender.** `src/render.tsx` exports `renderPage(page): string` using
  `react-dom/server` `renderToStaticMarkup` with a shared `Layout` (header, language switch,
  footer). `scripts/prerender.ts` (run with Node after `vite build --ssr src/render.tsx`)
  reads all content files, renders each to `dist/<lang path>/<slug>/index.html`, and writes
  `sitemap.xml`, `feed.xml` (Atom, from `content/*/news/`), `robots.txt` and the `_headers`
  file (§8). The client build (`vite build`) produces the CSS and the tiny enhancement script.
- Components available inside Markdown via a fixed set of directives the renderer replaces
  (written as HTML comments so plain Markdown still reads well):
  `<!-- steps -->…<!-- /steps -->` (numbered step cards), `<!-- note -->…<!-- /note -->`,
  `<!-- screenshot name="m4-connected" -->` (looks up `public/img/<name>.<lang>.webp`),
  `<!-- download -->` (download buttons, see §6).
- Scripts in the root `package.json`:
  - `npm run site:dev`: Vite dev server on `http://127.0.0.1:5180` with live reload.
  - `npm run site:build`: client build + SSR build + prerender into `apps/site/dist/`.
  - `npm run site:preview`: serves `apps/site/dist/` on `http://127.0.0.1:4320` (Vite
    preview, bound to loopback only).
  - `npm run site:check`: builds and then checks every internal link, every image reference,
    that each page exists in both languages, and that no HTML file references an `http(s)://`
    resource in `src`, `href` of a stylesheet, or `srcset` (links in `<a href>` are allowed).
    Part of `npm run check` once P10.1 lands.
  - Pages with `draft: true` are left out of the build; `SITE_DRAFTS=1` before any of these
    commands includes them (to review drafts locally).
- To look at it on a phone in the house: `npm run site:preview -- --host <tailnet-ip>` (the
  owner's tailnet only; never `0.0.0.0` on another network).

## 3. Site map

| Path | Page | Content |
| --- | --- | --- |
| `/` | Home | §4 |
| `/how-it-works/` | How it works | The two ways (At home / On this phone), a diagram of hub, phone and relay, what runs where |
| `/privacy/` | Privacy and security, explained | §5 |
| `/get-started/` | Get started | Chooser: "Just me, on my phone" → phone guide; "My family, at home" → hub guides; with a short "which is right for me" table |
| `/guides/phone/` | On your phone | Install the app, get an API key, paste it, first chat, export, moving to a hub later |
| `/guides/api-keys/` | Getting an API key | Anthropic and OpenAI step by step, setting a monthly spend limit, what it costs (example: "a typical day of chatting costs a few cents"), keeping the key safe |
| `/guides/mac/` | Set up on a Mac | Requirements (Apple silicon, 16 GB+ recommended), download, install, the setup wizard H1–H6 with screenshots, keeping the Mac awake |
| `/guides/docker/` | Set up with Docker | Linux, Windows (Docker Desktop), NAS; `compose.yaml`, setup URL from the logs, `HEMMIA_CONNECT`, updates, backups |
| `/guides/models/` | Choosing AI models | Local vs cloud, the recommendations by memory size (P1.9), Ollama and LM Studio, adding a cloud key on the hub |
| `/guides/phone-to-hub/` | Connect your phone | Scan the QR (H6/M3), what "Connected" means, adding more phones |
| `/guides/family/` | Invite your family | Invite sheet (M5), the invite link (M6/M7), what each person sees, removing a device |
| `/guides/remote/` | Away from home | Hemmia Connect (relay) vs Tailscale vs home only (H5), what the relay can and can't see |
| `/guides/backup/` | Backups and recovery | The recovery code (H3), backing up the data folder, moving to a new computer, phone export |
| `/guides/updates/` | Updating and uninstalling | Update notice, installing a new version, uninstall (data folder stays) |
| `/help/` | Troubleshooting | Hub not reachable (M8 checklist), setup code lost, forgot passphrase, model too slow, key refused, push not arriving |
| `/faq/` | FAQ | §5 short answers plus cost, "is it free", "do you see my chats", "which models", "why a relay", "open source?" |
| `/download/` | Download | §6 |
| `/news/` | News | Release notes and devlog posts (`content/*/news/YYYY-MM-DD-slug.md`), with the Atom feed |
| `/press/` | Press kit | One-paragraph and one-sentence descriptions, logo and ghost in SVG/PNG, screenshots, contact |
| `/legal/privacy/` | Privacy policy | Drafted in P5.9 (phone mode, hub, relay, push, website: no tracking) |
| `/legal/imprint/` | Imprint (Impressum) | Owner's details as required in Germany (§5 DDG); owner supplies them |

Header navigation: How it works · Privacy · Guides · Download · (language switch). Footer:
FAQ, Help, News, Press, GitHub, Privacy policy, Imprint.

## 4. Home page

Sections, top to bottom (copy direction from MARKETING.md §4; final words in P10.3):

1. **Hero:** the ghost, headline "Your AI, at home.", one sentence ("Hemmia is a private AI for
   you and your family. It runs on your own computer or simply on your phone, with the models
   you choose."), two buttons: "Get started" and "How it works". Below: App Store and Google
   Play badges (official badge artwork, served locally, used per Apple's and Google's
   guidelines) once the apps exist; before that, "Coming soon".
2. **Two ways to use it:** two cards, "On this phone" (your own key, nothing to install,
   chats stay on the phone) and "At home" (a hub on your computer: local models, the whole
   family, every device).
3. **What it does today:** chat with photos and documents, web search, daily briefs and
   helpers, pictures (on a Mac), family accounts. Each with one line and an icon. Only list
   what exists in the released version.
4. **What stays private:** three short promises with a link to /privacy/: "Your chats live on
   your devices." "We can't read anything, and we don't collect anything." "Open source, so
   anyone can check."
5. **Screenshots:** phone chat, hub setup H4, invite sheet M5.
6. **Coming next:** advisor, planner, shared family boards (labelled "planned", from
   MARKETING.md §7; no dates).
7. **Get started** call to action and the footer.

## 5. Privacy page

Plain language, no jargon without explanation. Sections: what stays on your devices; what
goes to an AI provider and when (only cloud models, only with your key); what the relay sees
(SECURITY.md §5.1 in plain words) and the one thing it could do in theory (§5.3), with
Tailscale as the alternative; push notifications carry no content; the website collects
nothing; open source and how to report a security problem. Every claim must match
SECURITY.md; Claude checks this in P10.4.

## 6. Downloads

- `content/downloads.json` (zod-validated): per platform `{ platform: 'ios' | 'android' |
  'macos' | 'docker', url, version?, note {en,de} }`. Until release the URLs are empty and the
  buttons read "Coming soon".
- macOS package and Docker point to the GitHub release page (`https://github.com/<org>/<repo>/releases/latest`)
  and the image `ghcr.io/<org>/<image>`; the Docker card shows the two commands from the Docker
  guide with a copy button.

## 7. Screenshots

- Taken from the real app, never mocked: iOS simulator (`xcrun simctl io booted screenshot`),
  Android emulator (`adb exec-out screencap -p`), the hub web app in a browser at 1280×800.
  Demo data only (a demo hub with made-up family names; never the owner's family data).
- Stored as `apps/site/public/img/<name>.<lang>.webp` (converted with `sharp`, which is
  approved for the server; the conversion script lives in `apps/site/scripts/`), long edge
  1200 px, with each name and its size in `apps/site/content/screenshots.json` (the page sets
  `width`/`height` from it; portrait images show at phone size). Pages place them with
  `<!-- screenshot name="…" alt="…" -->`, also inside step cards.
- How the 2026-10-24 set was made: the server in production mode on port 8796 with an empty
  data dir in the scratchpad, `OLLAMA_URL` pointing at a small stand-in that lists the models
  of `config/models.json` and streams fixed answers, `HEMMIA_RELAY_DOMAIN` and
  `HEMMIA_PUBLIC_HOSTNAMES` set to placeholders so Connect and the QR codes show; the wizard
  driven in headless Chrome over the DevTools protocol at 1280×800 (2×) and 390×844 (3×),
  language set through `kchat.language` in local storage; family members added with the
  admin CLI against that data dir. Never against the family hub or its data.
- Until screenshots exist, pages use the mockups' look as placeholders marked "preview".

## 8. Security headers for later hosting

`dist/_headers` (understood by Cloudflare Pages and Netlify; the same values go into a Caddy
or nginx config if self-hosted):

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains
```

## 9. Hosting (decided later)

The built site is plain files, so any static host works. Options for the owner to choose
from at P10.9: Cloudflare Pages (free, the relay's DNS is already there), GitHub Pages (free,
next to the public repo), or the relay VPS with Caddy (no third party, but couples the
website to the relay). Website and relay share `hemmia.app`; hubs live under `h.hemmia.app`
(SECURITY.md §5.2). Until then: `npm run site:preview` locally.
