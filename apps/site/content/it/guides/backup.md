---
title: Backup e recupero
description: Tieni al sicuro il codice di recupero, fai il backup della cartella dei dati dell’hub, passa a un nuovo computer e salva le chat del telefono.
nav: guides
order: 80
---

# Backup e recupero

## Il tuo codice di recupero

Quando crei l’account, Hemmia mostra una sola volta un codice di recupero. Se dimentichi la passphrase, questo codice è l’unico modo per rientrare nel tuo account. Nessun altro può reimpostarla per te, nemmeno l’admin.

<!-- screenshot name="mac-setup-recovery" alt="La schermata del codice di recupero, con un pulsante Copia e una casella per confermare di averlo scritto" -->

Scrivilo su carta e conservalo in un posto sicuro, ad esempio con gli altri documenti importanti. Non tenerlo solo sul telefono o sul computer su cui usi Hemmia.

Se usi il codice per impostare una nuova passphrase, ricevi un nuovo codice e quello vecchio non funziona più.

## Backup dell’hub

Tutto ciò che il tuo hub salva è in un’unica cartella dei dati: account, chat, foto e documenti. Fai il backup di quella cartella e potrai ripristinare l’hub.

- **Su un Mac:** la cartella è `Library/Application Support/Hemmia` nella cartella Inizio dell’utente che ha installato Hemmia. Time Machine ne fa il backup automaticamente, anche mentre Hemmia è in esecuzione.
- **Con Docker:** i dati sono nel volume `hemmia-data`. Ferma l’hub e copia il volume in un archivio:

  ```sh
  docker compose stop hub
  docker run --rm -v hemmia_hemmia-data:/data -v "$PWD":/backup busybox tar czf /backup/hemmia-data.tar.gz -C /data .
  docker compose start hub
  ```

<!-- note -->
Le chat nel backup sono cifrate con la passphrase di ognuno. Chi trova il backup non può leggerle, e nemmeno tu se perdi sia la passphrase sia il codice di recupero.
<!-- /note -->

## Passare a un nuovo computer

<!-- steps -->
## Ferma Hemmia sul vecchio computer
Esegui lì il programma di disinstallazione (vedi [Aggiornare e disinstallare](/it/guides/updates/)). Rimuove il programma; la cartella dei dati resta.

## Copia la cartella dei dati
Copia l’intera cartella dei dati nello stesso posto sul nuovo computer, nella cartella Inizio dell’utente che vi eseguirà Hemmia.

## Installa Hemmia sul nuovo computer
Esegui il programma di installazione. Trova i dati, avvia l’hub e salta la configurazione.
<!-- /steps -->

Account, chat e passphrase vengono con te. Con l’accesso remoto (Hemmia Connect), l’hub mantiene il suo indirizzo, quindi i telefoni continuano a funzionare. Con Tailscale, il nuovo computer ha un proprio indirizzo Tailscale: dagli il vecchio nome in Tailscale, o ricollega i telefoni. I modelli locali non sono nella cartella dei dati; scaricali di nuovo in **Impostazioni → Modelli**.

## Le chat sul telefono

In modalità telefono, le tue chat sono solo sul telefono. Usa ogni tanto **Impostazioni → Esporta chat** per salvarle in un file, e **Importa chat** per riprenderle, ad esempio su un nuovo telefono. Vedi [Hemmia sul telefono](/it/guides/phone/).

Il file esportato non è protetto, quindi conservalo in un posto sicuro. La tua chiave API non c’è.
