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

- A computer that stays on, with Docker and Docker Compose (on Windows: Docker Desktop with WSL).
- For local models: 8 GB of memory or more (16 GB for the better models), and space for the models (several GB each). Cloud models work without them.
- `git`, to download Hemmia from [GitHub](https://github.com/andreask99/hemmia).

<!-- steps -->
## Download Hemmia
```sh
git clone https://github.com/andreask99/hemmia.git
cd hemmia/packaging/docker
```

## Start it
```sh
./start.sh
```

This starts the hub, Ollama for local models and web search. The first time it builds the hub and downloads Ollama and the search engine, which takes a few minutes. When the hub is ready, it opens the setup in your browser, or shows its address.

## Finish the setup
Give your family a name, create your account, write down the recovery code, choose your AI (the hub recommends a model that fits this computer) and turn on remote access. Then connect your phone: see [Connect your phone](/guides/phone-to-hub/).
<!-- /steps -->

Without local models: `./start.sh --no-ollama`. Without web search: `./start.sh --no-search`. If port 8787 is already taken on this computer, put `HEMMIA_PORT=8790` (or another free port) into the file `.env` in this folder.

## A computer without a browser

On a NAS or server you can't open `localhost` in a browser. Put `HEMMIA_CONNECT=1` into the file `.env` in `packaging/docker` and run `./start.sh`. It turns on Hemmia Connect right away, and the log also shows a `https://…/setup#…` link that works from any device. Treat that link like a password until the setup is done.

## Ollama that's already installed

If Ollama already runs on the computer, start with `./start.sh --no-ollama` and put `OLLAMA_URL=http://host.docker.internal:11434` into `.env`. On Linux, Ollama listens only on the computer itself by default, so the container can't reach it: set `OLLAMA_HOST=0.0.0.0` for the Ollama service and make sure your firewall keeps port 11434 closed to the network, or simply use Hemmia's own Ollama (plain `./start.sh`).

## Updating and backups

See [Updating and uninstalling](/guides/updates/) and [Backups and recovery](/guides/backup/). All of the hub's data is in the Docker volume `hemmia-data`.
