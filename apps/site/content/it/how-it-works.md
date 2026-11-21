---
title: Come funziona
description: La tua IA su un computer di casa, l’app Hemmia sui vostri telefoni e i due modi in cui si raggiungono.
nav: how
order: 10
---

# Come funziona

Hemmia gira su un computer di casa, l’*hub*. Tutta la famiglia lo usa con l’app Hemmia sul telefono, o in un browser su tablet e portatile. L’app si collega all’hub, a casa e fuori casa.

<!-- diagram name="how" -->

## L’hub a casa

L’hub è un Mac, o qualsiasi computer che può eseguire Docker, come un PC o un NAS. Ci installi Hemmia una volta, e resta acceso.

- **I modelli locali** girano sull’hub stesso tramite Ollama o LM Studio. Niente di ciò che scrivi lascia la casa. Sono più lenti e meno capaci dei migliori modelli cloud, ma migliorano in fretta.
- **I modelli cloud** sono facoltativi: ognuno può aggiungere la propria chiave di Anthropic, OpenAI o OpenRouter. La chiave è salvata cifrata con la passphrase di quella persona, quindi nessun altro può vederla o usarla. Le chat con questi modelli vanno a quel fornitore.
- **Un account per persona.** Le chat di ognuno sono cifrate con una chiave che deriva dalla sua passphrase. Chi gestisce l’hub non può leggere le chat degli altri.

<!-- screenshot name="hub-chat" alt="Una chat sull’hub nel browser: una domanda su idee per la cena e la risposta con tre proposte; chat precedenti nella barra laterale" -->

## Come l’app raggiunge l’hub

Per sicurezza, l’hub risponde solo sul proprio computer. Per far entrare i vostri telefoni, a casa e fuori, gli serve una connessione protetta. Ne scegli una fra due:

- **Tailscale: gratis, con un po’ di configurazione.** Tailscale è una rete privata (una VPN), gratuita per uso personale. Crei un account Tailscale, installi Tailscale sul computer dell’hub e l’app Tailscale su ogni telefono, li colleghi tutti alla stessa rete e attivi HTTPS una volta. Poi funziona da solo. [Passo dopo passo](/it/guides/remote/)
- **Hemmia Connect: pronto con un interruttore.** Per chi preferisce non configurare nulla. Attivalo durante la configurazione dell’hub, e il tuo hub riceve un proprio indirizzo; i telefoni si aggiungono scansionando un codice, senza installare altro. Il nostro relay inoltra il traffico senza poterlo leggere: la connessione è cifrata dal tuo telefono fino al tuo hub. Durante la beta Connect è gratuito.

Puoi iniziare con uno e passare all’altro più tardi. Oppure fare a meno di entrambi e usare Hemmia solo in un browser sul computer dell’hub.

## Senza hub: solo l’app

Se non hai un computer che può restare acceso, l’app Hemmia funziona anche da sola. Parla allora direttamente con il fornitore di IA che hai scelto, Anthropic (Claude) o OpenAI, con la tua chiave. Nessun nostro server in mezzo.

- La tua chiave è custodita nella memoria sicura del telefono (il Portachiavi sull’iPhone) e non lascia mai il telefono, se non verso il fornitore.
- Le tue chat vengono salvate sul telefono, cifrate.
- Paghi il fornitore per ciò che usi. Una giornata tipica di chat costa pochi centesimi.

Un hub puoi aggiungerlo più tardi.

[La privacy, spiegata](/it/privacy/) · [Domande e risposte](/it/faq/)
