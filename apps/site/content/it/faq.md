---
title: Domande e risposte
description: Risposte brevi su costi, privacy, modelli, relay e open source.
nav: faq
order: 90
---

# Domande e risposte

## Hemmia è gratis?

Sì. Le app e l’hub sono gratuiti e non c’è un account da noi. L’unico extra a pagamento facoltativo è Hemmia Connect, che permette ai tuoi telefoni di raggiungere l’hub con un solo interruttore (gratis durante la beta). Tailscale fa lo stesso gratis se lo configuri tu. Se usi modelli cloud, paghi direttamente il fornitore (Anthropic, OpenAI o OpenRouter) per ciò che usi. I modelli locali sul tuo hub costano solo l’elettricità.

## Quanto costano i modelli cloud?

Dipende da quanto scrivi e da quale modello scegli. Una giornata tipica di chat costa pochi centesimi. I fornitori permettono di impostare un limite di spesa mensile, e ti consigliamo di farlo.

## Vedete le mie chat?

No. Le tue chat sono salvate sul tuo hub o sul tuo telefono, cifrate. Non gestiamo nessun server che le conservi, e il nostro relay non può leggere il traffico che inoltra. Vedi [La privacy, spiegata](/it/privacy/).

## Quali modelli di IA posso usare?

Su un hub: modelli locali tramite Ollama o LM Studio, e modelli cloud di Anthropic, OpenAI e OpenRouter con una chiave. Solo sul telefono: Anthropic e OpenAI con la tua chiave. Puoi scegliere un modello diverso per ogni chat.

## Quanto sono buoni i modelli locali?

Buoni per le domande di tutti i giorni, la scrittura e i riassunti, e tengono tutto in casa. I migliori modelli cloud restano più veloci e più capaci per i compiti difficili. Hemmia consiglia i modelli locali adatti alla memoria del tuo computer.

## Di quale computer ho bisogno per un hub?

Un Mac con chip Apple (16 GB di memoria o più è l’ideale per i modelli locali), o qualsiasi computer che esegue Docker, come un PC o un NAS. Se usi solo modelli cloud, basta un computer piccolo. Deve restare acceso.

## Perché c’è un relay?

Perché il tuo telefono possa raggiungere l’hub, a casa e fuori, senza aprire il router né configurare nulla. Il relay inoltra solo traffico cifrato. Se preferisci, usa Tailscale.

## I miei figli possono usarlo?

Sì, su un hub gestito da un genitore. Ognuno ha il proprio account e le proprie chat private, e un admin può creare account per ragazzi che vedono solo i modelli consentiti dall’admin, cercano sul web con SafeSearch rigoroso o per niente e non possono creare immagini. L’app in sé è per chi ha almeno 13 anni; i più piccoli la usano con un genitore.

## Cosa succede se perdo la passphrase?

Usa il codice di recupero, che hai salvato quando hai creato l’account. Senza passphrase né codice di recupero nessuno può aprire le tue chat, nemmeno chi gestisce l’hub.

## Hemmia è open source?

Sì. Il codice è [su GitHub](https://github.com/andreask99/hemmia) con licenza AGPL, così chiunque può verificare cosa fa e come protegge i tuoi dati.
