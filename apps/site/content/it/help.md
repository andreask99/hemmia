---
title: Risoluzione dei problemi
description: Cosa fare quando l’hub non è raggiungibile, un link di configurazione è scaduto, hai dimenticato la passphrase, un modello è lento o una chiave viene rifiutata.
nav: help
order: 90
---

# Risoluzione dei problemi

## L’app dice che l’hub non è raggiungibile

L’app mostra cosa controllare e quando ha raggiunto l’hub l’ultima volta da questo telefono.

- Il computer è acceso e non in stop? Un Mac in stop non può rispondere.
- Ha internet?
- Hemmia Connect o Tailscale è attivo? I telefoni raggiungono l’hub solo tramite uno dei due, anche a casa: vedi [Come funziona](/it/how-it-works/).

Tocca **Riprova** quando il computer è di nuovo disponibile, o **Passa a un altro hub** per aprirne un altro.

## Il link di configurazione non funziona

La pagina di configurazione ha bisogno del link aperto dal programma di installazione. Se dice **Apri il link di configurazione dal programma di installazione**, riapri la pagina dal programma di installazione. Un link di configurazione vale 24 ore. Su un Mac, esegui di nuovo il programma di installazione: riavvia Hemmia e apre la pagina di configurazione con un nuovo link (o quello attuale, se è ancora valido). Con Docker, esegui `docker compose restart hub` e apri il nuovo link da `docker compose logs hub`.

## Ho dimenticato la passphrase

Nella pagina di accesso, tocca **Hai dimenticato la passphrase?** e inserisci il nome utente, il codice di recupero e una nuova passphrase. Ricevi poi un nuovo codice di recupero; quello vecchio non funziona più. Scrivi quello nuovo.

<!-- note -->
Nessun altro può reimpostare la tua passphrase, nemmeno un admin: le tue chat sono cifrate con essa. Senza la passphrase e il codice di recupero, il tuo account non può più essere aperto. Un admin può allora **Disattivare** il vecchio account in **Impostazioni → Famiglia** e invitarti di nuovo: ricominci con un nuovo account vuoto, con un altro nome utente.
<!-- /note -->

## Un modello è molto lento

I modelli locali girano sul computer dell’hub, e i modelli grandi richiedono molta memoria. In **Impostazioni → Modelli**, Hemmia indica i modelli adatti al tuo computer; scegline uno più piccolo, o usa un modello cloud per le domande lunghe o difficili. Vedi [Scegliere i modelli di IA](/it/guides/models/).

## La mia chiave viene rifiutata

- **Questa chiave è stata rifiutata:** controlla di averla copiata tutta, senza spazi all’inizio o alla fine. Se non funziona ancora, crea una nuova chiave nella console del fornitore.
- **La tua chiave ha raggiunto il limite per ora:** hai raggiunto il limite di frequenza del fornitore o il tuo limite di spesa. Riprova più tardi, o aumenta il limite nella console del fornitore.
- **Il fornitore è occupato:** riprova tra un minuto.

## Le notifiche non arrivano

Controlla che le notifiche di Hemmia siano consentite nelle Impostazioni del telefono e che l’hub sia connesso a internet. Le notifiche arrivano dall’hub, quindi solo mentre è acceso.

## Contatto

Ancora bloccato? Scrivi a [andreas.apps@icloud.com](mailto:andreas.apps@icloud.com), in italiano, inglese, tedesco o francese. Indica il dispositivo e la versione che usi (nelle impostazioni dell’app); non inviare mai la passphrase, il codice di recupero o le chiavi.
