---
title: Aggiornare e disinstallare
description: Come vieni a sapere di una nuova versione, come installarla e come rimuovere Hemmia tenendo i tuoi dati.
nav: guides
order: 85
---

# Aggiornare e disinstallare

## Sapere di una nuova versione

Gli admin vedono un avviso in **Impostazioni → Sistema** quando è disponibile una nuova versione, con un link alle novità e a come aggiornare.

## Aggiornare su un Mac

Scarica il nuovo pacchetto dalla [pagina di download](/it/download/) e installalo come la prima volta. Il programma di installazione tiene i tuoi dati, sostituisce il programma e riavvia l’hub; la configurazione non riparte. I telefoni restano collegati. Le risposte che si stanno scrivendo in quel momento si fermano, quindi aggiorna quando nessuno sta chattando.

## Aggiornare con Docker

Nella cartella `packaging/docker`, scarica la nuova versione e riavvia l’hub:

```sh
git pull
./start.sh
```

I tuoi dati restano nel volume `hemmia-data`. Usa le stesse opzioni di quando l’hai avviato, ad esempio `./start.sh --no-ollama`.

## Disinstallare su un Mac

Apri il Terminale ed esegui:

```sh
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Rimuove il programma e ferma l’hub, e con esso l’Ollama, le immagini e la ricerca web installati da Hemmia. Le tue chat e impostazioni restano in `Library/Application Support/Hemmia` nella tua cartella Inizio; elimina tu quella cartella se vuoi cancellare anche quelle. I modelli scaricati sono in `.ollama` nella tua cartella Inizio; eliminali anche se nessun’altra app usa Ollama.
