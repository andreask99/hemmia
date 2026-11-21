---
title: Scegliere i modelli di IA
description: Modelli locali sul tuo hub, altri server locali come LM Studio e modelli cloud con la tua chiave.
nav: guides
order: 50
---

# Scegliere i modelli di IA

Hemmia può usare due tipi di modelli, e puoi combinarli: scegli un modello per ogni chat.

| | Modelli locali | Modelli cloud |
| --- | --- | --- |
| Dove girano | Sul tuo hub | Presso il fornitore (Anthropic, OpenAI, OpenRouter) |
| I tuoi messaggi | Restano in casa | Vanno al fornitore per le chat in cui li scegli |
| Costo | L’elettricità | Paghi il fornitore per ciò che usi |
| Velocità e capacità | Buoni per le cose di tutti i giorni, più lenti sui computer piccoli | I modelli più potenti disponibili |

## Modelli locali

I modelli locali hanno bisogno di [Ollama](https://ollama.com) sull’hub. Più memoria ha il tuo computer, più grandi (e migliori) sono i modelli che può eseguire.

<!-- steps -->
## Apri le impostazioni dei modelli
In Hemmia, apri **Impostazioni → Modelli**. Gli admin vedono la sezione **Per tutta la famiglia**.

## Scegli un modello
In **Aggiungi un modello**, Hemmia elenca i modelli adatti alla memoria del tuo computer, con il più adatto segnato come **Consigliato**. I modelli che richiedono più memoria sono in grigio.

## Scaricalo
Tocca **Scarica**. Un modello pesa qualche gigabyte, quindi può volerci un po’; puoi lasciare la pagina, il download continua.
<!-- /steps -->

Una volta scaricato, il modello compare nell’elenco dei modelli di tutti. Ognuno può impostare il proprio **Modello predefinito per le nuove chat**.

### LM Studio e altri server locali

Se usi già LM Studio, llama.cpp o vLLM su questo computer o su un altro della rete di casa, aggiungilo in **Altri server locali** con il suo indirizzo. I suoi modelli compaiono allora anche in Hemmia.

## Modelli cloud con la tua chiave

Ognuno aggiunge la propria chiave; è salvata cifrata con la sua passphrase, quindi nessun altro, nemmeno l’admin, può vederla o usarla.

<!-- steps -->
## Ottieni una chiave
Crea una chiave API presso il tuo fornitore: Anthropic su platform.claude.com, OpenAI su platform.openai.com o OpenRouter su openrouter.ai. Imposta lì anche un limite di spesa mensile.

## Aggiungila in Hemmia
Apri **Impostazioni → Modelli → IA cloud**, scegli il fornitore, incolla la chiave e tocca **Verifica e salva**. Hemmia verifica la chiave con il fornitore senza inviare nessuna delle tue chat.

## Se vuoi, imposta un limite
In **Limite mensile in dollari USA**, Hemmia può smettere di usare i modelli cloud per te quando la spesa stimata raggiunge il limite.
<!-- /steps -->

<!-- note -->
Solo le chat in cui scegli un modello cloud vanno al fornitore, con ciò che serve al modello per rispondere: la chat fino a quel punto, le sue foto e i documenti. Le chat con i modelli locali non lasciano mai la casa.
<!-- /note -->
