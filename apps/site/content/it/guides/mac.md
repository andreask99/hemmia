---
title: Configurare Hemmia su un Mac
description: Installa l’hub su un Mac con chip Apple, configuralo nel browser e collega il telefono.
nav: guides
order: 20
---

# Configurare Hemmia su un Mac

L’hub è il computer di casa su cui gira Hemmia per la tua famiglia. Un Mac va bene: è silenzioso, consuma poco, e i Mac con chip Apple eseguono velocemente i modelli di IA locali.

## Cosa ti serve

- Un Mac con chip Apple (M1 o più recente) e macOS 14 o successivo.
- Con 8 GB di memoria gira un modello locale piccolo; 16 GB o più è meglio, e le immagini richiedono 24 GB. I modelli cloud funzionano con qualsiasi Mac.
- Circa 10 GB di spazio libero su disco per un modello locale, e 6 GB in più per le immagini.
- Il Mac deve restare acceso. Hemmia gli impedisce di andare in stop finché i telefoni devono raggiungerlo.

<!-- steps -->
## Scarica e installa
Scarica il pacchetto dell’hub Hemmia dalla [pagina di download](/it/download/) e aprilo. Il programma di installazione chiede la password del Mac, perché il programma va nella cartella Application Support del sistema.

## Configura nel browser
Quando l’installazione è finita, il browser apre la configurazione di Hemmia. Dai un nome alla tua famiglia, crea il tuo account e scrivi il codice di recupero. Se hai chiuso la pagina o hai aspettato più di un giorno, esegui di nuovo il programma di installazione: apre la configurazione con un nuovo link.

<!-- screenshot name="mac-setup-welcome" alt="Il primo passo della configurazione: benvenuto in Hemmia, con la memoria e lo spazio su disco di questo Mac e un campo per il nome della famiglia" -->


## Scegli la tua IA
Hemmia consiglia un modello locale adatto a questo Mac: scaricalo, aggiungi una chiave cloud, o entrambe le cose. Se Ollama non è ancora installato, **Installa Ollama** lo fa per te. Qui puoi anche **Attivare le immagini** e **Attivare la ricerca web**. Puoi cambiare tutto più tardi in Impostazioni → Modelli.

<!-- screenshot name="mac-setup-models" alt="L’elenco dei modelli nella configurazione: modelli locali consigliati con la dimensione del download, alcuni già scaricati" -->


## Rendilo raggiungibile dai telefoni
I telefoni raggiungono l’hub solo tramite Hemmia Connect o Tailscale, anche a casa. Attiva Connect, oppure scegli Tailscale e segui [Fuori casa](/it/guides/remote/). Con «Non ora», Hemmia funziona solo in un browser su questo Mac.

<!-- screenshot name="mac-setup-remote" alt="La scelta tra Hemmia Connect (consigliato), Tailscale e Non ora" -->


## Aggiungi il telefono
Installa l’app Hemmia sul telefono, tocca **Scansiona il codice** e scansiona il codice sullo schermo del Mac. Il telefono accede come te. Altri telefoni: [Collegare il telefono](/it/guides/phone-to-hub/).

<!-- screenshot name="mac-setup-phone" alt="L’ultimo passo della configurazione: un codice QR che fa accedere il telefono" -->

<!-- /steps -->

<!-- note -->
I modelli locali girano con [Ollama](https://ollama.com). Se questo Mac non lo ha ancora, il passo dei modelli offre **Installa Ollama**: Hemmia lo scarica, lo controlla e lo avvia per te. Se usi già l’app Ollama, Hemmia usa quella. I modelli cloud funzionano senza Ollama.
<!-- /note -->

## Dove si trovano i tuoi dati

Le tue chat e impostazioni sono salvate nella Libreria del tuo utente: `~/Library/Application Support/Hemmia`. Includi quella cartella nei backup (Time Machine la include); vedi [Backup e recupero](/it/guides/backup/).

## Disinstallare

Esegui questo nel Terminale:

```
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Rimuove il programma, tiene la cartella dei dati e ti dice dove si trova. Aggiornamenti: [Aggiornare e disinstallare](/it/guides/updates/).
