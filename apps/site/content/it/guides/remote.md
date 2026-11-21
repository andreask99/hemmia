---
title: Fuori casa
description: Raggiungi il tuo hub dai telefoni con Hemmia Connect o Tailscale. Cosa il relay può vedere e cosa no.
nav: guides
order: 75
---

# Fuori casa

Il tuo hub risponde solo sul proprio computer. Per i tuoi telefoni, a casa e fuori, scegli uno dei tre modi durante la configurazione (passo **Fuori casa**) o più tardi in **Impostazioni → Sistema → Accesso remoto**.

| | Hemmia Connect | Tailscale | Non ora |
| --- | --- | --- | --- |
| Funziona | Ovunque | Ovunque | Solo in un browser sul computer dell’hub |
| Su ogni telefono | Niente di più | L’app Tailscale e un account | – |
| Chi inoltra il traffico | Il nostro relay (non può leggerlo) | La rete di Tailscale | – |
| Impegno | Un interruttore | Qualche passo, in parte nel Terminale | Nessuno |

## Hemmia Connect

Attiva **Hemmia Connect**: durante la configurazione con **Attiva Connect**, o più tardi con l’interruttore in **Impostazioni → Sistema → Accesso remoto**. Il tuo hub riceve un proprio indirizzo e i telefoni lo raggiungono tramite il nostro relay. Connect impedisce anche al computer di andare in stop.

La connessione è cifrata dal tuo telefono fino al tuo hub. Il relay la inoltra ma non ha le chiavi per aprirla: non vede mai i tuoi messaggi, le passphrase o le foto. La [pagina sulla privacy](/it/privacy/) spiega cosa potrebbe fare in teoria, e perché i log dei certificati lo mostrerebbero.

Le impostazioni mostrano se Connect funziona, per quanto tempo è valido il certificato dell’hub e quanti dati sono passati dal relay questo mese. **Dimentica questo indirizzo** rinuncia all’indirizzo; i telefoni collegati tramite Connect hanno poi bisogno di un nuovo link.

Ogni hub può far passare fino a 20 GB al mese tramite il relay; una famiglia di solito ne usa da uno a tre. Se un hub raggiunge il limite, i telefoni non possono raggiungerlo tramite Connect fino all’inizio del mese successivo (contato in UTC); Tailscale continua a funzionare.

Se Connect smette di funzionare per dieci minuti (il relay non funziona, o internet a casa), gli admin ricevono una notifica, e un’altra quando funziona di nuovo. L’hub continua a provare a ricollegarsi da solo.

## Tailscale

Tailscale è una rete privata che gestisci tu. Ogni telefono ha bisogno dell’app Tailscale e deve essere collegato alla stessa rete.

<!-- steps -->
## Installa Tailscale sul computer dell’hub
Installa Tailscale da [tailscale.com](https://tailscale.com) e accedi.

## Attiva i certificati HTTPS
Nella console di amministrazione di Tailscale, apri **DNS** e, sotto **HTTPS Certificates**, scegli **Enable HTTPS**.

## Collega Hemmia a Tailscale
Su un Mac, apri il Terminale ed esegui:

```sh
"/Library/Application Support/Hemmia/current/packaging/tailscale.sh"
```

Pubblica l’hub solo all’interno della tua rete Tailscale (mai su internet pubblico), lo riavvia e mostra il nuovo indirizzo.

Con Docker, esegui `tailscale serve --bg --https=443 http://127.0.0.1:8787` sul computer, metti `HEMMIA_PUBLIC_HOSTNAMES=<nome>.ts.net` (il suo nome da `tailscale status`) in `.env` accanto a `compose.yaml` ed esegui di nuovo `docker compose up -d`.

## Aggiungi i telefoni
Installa Tailscale su ogni telefono e accedi alla stessa rete. Poi collega i telefoni all’hub come in [Collegare il telefono](/it/guides/phone-to-hub/).
<!-- /steps -->

## Non ora

Senza accesso remoto, Hemmia funziona solo in un browser sul computer dell’hub. Puoi attivare Connect o configurare Tailscale in qualsiasi momento più tardi.
