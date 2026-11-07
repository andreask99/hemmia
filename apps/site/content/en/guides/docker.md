---
title: Set up with Docker
description: Run the Hemmia hub with Docker on Linux, Windows or a NAS, with local models and web search if you like.
nav: guides
order: 30
draft: true
---

# Set up with Docker

Docker runs the hub on Linux, on Windows with Docker Desktop, or on a NAS that supports Docker. On a Mac, the [Mac package](/guides/mac/) is simpler.

## What you need

- A computer that stays on, with Docker and Docker Compose.
- For local models: 16 GB of memory or more, and space for the models (several GB each). Cloud models work without them.
- The Hemmia files from GitHub. <!-- CHECK: repository link and released image (P8.5) -->

<!-- steps -->
## Start the hub
In the folder `packaging/docker`, run:

```sh
docker compose --profile ollama up -d
```

This starts the hub and Ollama for local models. Without `--profile ollama`, the hub runs alone and uses cloud models.

## Open the setup
Show the setup link with:

```sh
docker compose logs hub | grep "Hemmia setup"
```

Open the `http://localhost:8787/setup#…` link in a browser on the same computer. The link is valid for 24 hours; `docker compose restart hub` prints a new one.

## Finish the setup
Give your family a name, create your account, write down the recovery code, choose your AI and turn on remote access. Then connect your phone: see [Connect your phone](/guides/phone-to-hub/).
<!-- /steps -->

## A computer without a browser

On a NAS or server you can't open `localhost` in a browser. Put `HEMMIA_CONNECT=1` into a file `.env` next to `compose.yaml` and start the hub. It turns on Hemmia Connect right away, and the log also shows a `https://…/setup#…` link that works from any device. Treat that link like a password until the setup is done.

## Web search

```sh
echo "SEARXNG_SECRET=$(openssl rand -hex 32)" >> .env
docker compose --profile ollama --profile searxng up -d
```

## Ollama that's already installed

If Ollama already runs on the computer, leave out `--profile ollama` and put `OLLAMA_URL=http://host.docker.internal:11434` into `.env`. On Linux, Ollama listens only on the computer itself by default, so the container can't reach it: set `OLLAMA_HOST=0.0.0.0` for the Ollama service and make sure your firewall keeps port 11434 closed to the network, or simply use `--profile ollama` instead.

## Updating and backups

See [Updating and uninstalling](/guides/updates/) and [Backups and recovery](/guides/backup/). All of the hub's data is in the Docker volume `hemmia-data`.
