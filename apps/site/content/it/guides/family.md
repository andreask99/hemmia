---
title: Invitare la famiglia
description: Dai a ognuno il proprio account con un codice QR o un link, e gestisci account e dispositivi.
nav: guides
order: 70
---

# Invitare la famiglia

Ognuno ha il proprio account con la propria passphrase. Gli admin gestiscono gli account, ma nessuno tranne il titolare dell’account può leggerne le chat.

<!-- steps -->
## Crea un invito
In Hemmia, apri **Impostazioni → Famiglia** e tocca **Crea link d’invito**. Scegli **Account admin** per un altro genitore, o **Account ragazzi (limitato)** per un figlio.

## Fallo scansionare, o invia il link
Hemmia mostra un codice QR. La persona lo scansiona con la fotocamera del telefono, oppure tocchi **Invia link d’invito** per mandarlo con una app di messaggi. L’invito funziona una volta, per 7 giorni.

<!-- screenshot name="hub-invite" alt="Impostazioni, Famiglia: un nuovo invito come codice QR, con un pulsante Invia link d’invito e il link stesso" -->

## La persona crea il suo account
Sceglie un nome utente e una passphrase e riceve un codice di recupero da conservare in un posto sicuro.
<!-- /steps -->

<!-- note -->
I link d’invito funzionano solo se altri dispositivi possono raggiungere il tuo hub: attiva prima Hemmia Connect o configura Tailscale.
<!-- /note -->

## Account limitati

Un account limitato è adatto ai ragazzi: gli admin decidono se gli account limitati possono usare la ricerca web e i modelli cloud, in **Impostazioni → Famiglia**. Puoi limitare qualsiasi account, o togliere la limitazione, più tardi.

<!-- screenshot name="hub-family" alt="Impostazioni, Famiglia: tre account, uno segnato come Limitato, ciascuno con pulsanti per disattivare, limitare e vedere i dispositivi" -->

## Dispositivi

Ognuno vede i propri dispositivi in **Impostazioni → Account → Dispositivi**, può aggiungerne un altro con un codice QR e rimuovere un telefono perso. Gli admin possono fare lo stesso per gli altri in **Impostazioni → Famiglia**. Un dispositivo rimosso viene disconnesso subito e ha bisogno di un nuovo link per tornare.

## Disattivare un account

**Disattiva** impedisce a un account di accedere, senza eliminare nulla. **Attiva** lo ripristina.

## Eliminare un account

Ognuno può eliminare il proprio account con tutto il suo contenuto in **Impostazioni → Account → Elimina account**, con la propria passphrase. Un admin può eliminare l’account di un altro in **Impostazioni → Famiglia → Elimina**, con la propria passphrase. L’eliminazione è definitiva. Un hub ha sempre almeno un admin.
