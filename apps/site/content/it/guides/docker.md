---
title: Configurare con Docker
description: Esegui l’hub Hemmia con Docker su Linux, Windows o un NAS, con modelli locali e ricerca web se vuoi.
nav: guides
order: 30
---

# Configurare con Docker

Docker esegue l’hub su Linux, su Windows con Docker Desktop o su un NAS che supporta Docker. Su un Mac, il [pacchetto per Mac](/it/guides/mac/) è più semplice.

## Cosa ti serve

- Un computer che resta acceso, con Docker e Docker Compose (su Windows: Docker Desktop con WSL).
- Per i modelli locali: 8 GB di memoria o più (16 GB per i modelli migliori) e spazio per i modelli (diversi GB ciascuno). I modelli cloud funzionano senza.
- `git`, per scaricare Hemmia da [GitHub](https://github.com/andreask99/hemmia).

<!-- steps -->
## Scarica Hemmia
```sh
git clone https://github.com/andreask99/hemmia.git
cd hemmia/packaging/docker
```

## Avvialo
```sh
./start.sh
```

Avvia l’hub, Ollama per i modelli locali e la ricerca web. La prima volta costruisce l’hub e scarica Ollama e il motore di ricerca, il che richiede qualche minuto. Quando l’hub è pronto, apre la configurazione nel browser, o ne mostra l’indirizzo.

## Completa la configurazione
Dai un nome alla tua famiglia, crea il tuo account, scrivi il codice di recupero, scegli la tua IA (l’hub consiglia un modello adatto a questo computer) e attiva l’accesso remoto. Poi collega il telefono: vedi [Collegare il telefono](/it/guides/phone-to-hub/).
<!-- /steps -->

Senza modelli locali: `./start.sh --no-ollama`. Senza ricerca web: `./start.sh --no-search`. Se la porta 8787 è già occupata su questo computer, metti `HEMMIA_PORT=8790` (o un’altra porta libera) nel file `.env` di questa cartella.

## Un computer senza browser

Su un NAS o un server non puoi aprire `localhost` in un browser. Metti `HEMMIA_CONNECT=1` nel file `.env` in `packaging/docker` ed esegui `./start.sh`. Hemmia Connect si attiva subito, e il log mostra anche un link `https://…/setup#…` che funziona da qualsiasi dispositivo. Tratta quel link come una password finché la configurazione non è finita. Hemmia Connect è un nostro servizio: attivandolo accetti le [Condizioni d’uso](/it/legal/terms/).

## Ollama già installato

Se Ollama gira già sul computer, avvia con `./start.sh --no-ollama` e metti `OLLAMA_URL=http://host.docker.internal:11434` in `.env`. Su Linux, Ollama di default ascolta solo sul computer stesso, quindi il container non può raggiungerlo: imposta `OLLAMA_HOST=0.0.0.0` per il servizio Ollama e assicurati che il firewall tenga la porta 11434 chiusa verso la rete, o usa semplicemente l’Ollama di Hemmia (`./start.sh` e basta).

## Aggiornamenti e backup

Vedi [Aggiornare e disinstallare](/it/guides/updates/) e [Backup e recupero](/it/guides/backup/). Tutti i dati dell’hub sono nel volume Docker `hemmia-data`.
