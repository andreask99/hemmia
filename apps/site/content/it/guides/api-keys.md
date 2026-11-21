---
title: Ottenere una chiave API
description: Crea una chiave presso Anthropic o OpenAI, imposta un limite di spesa mensile e tieni la chiave al sicuro.
nav: guides
order: 20
---

# Ottenere una chiave API

Una chiave API permette a Hemmia di usare i modelli di un fornitore a tuo nome. Paghi direttamente il fornitore per ciò che usi; Hemmia non aggiunge nulla. Una giornata tipica di chat costa pochi centesimi.

La chiave è separata da un abbonamento a ChatGPT o Claude: anche se ne hai uno, ti serve un account sulla piattaforma per sviluppatori del fornitore e un metodo di pagamento lì.

## Anthropic (modelli Claude)

<!-- steps -->
## Crea un account
Apri la [Claude Console](https://platform.claude.com) e registrati o accedi.

## Aggiungi un metodo di pagamento
Apri **Settings → Billing**, aggiungi una carta e acquista un piccolo credito per iniziare, ad esempio cinque dollari. Lascia disattivata la ricarica automatica: così non puoi mai spendere più del credito acquistato.

## Imposta un limite di spesa
Nella stessa pagina **Billing**, sotto **Spend limits**, scegli **Set limit** e inserisci un importo mensile, ad esempio dieci dollari. Quando viene raggiunto, le richieste si fermano fino all’inizio del mese successivo invece di costare di più.

## Crea la chiave
Apri [API keys](https://platform.claude.com/settings/keys), crea una chiave e dalle un nome come «Hemmia telefono». Copiala subito: la console la mostra una sola volta.
<!-- /steps -->

## OpenAI (modelli GPT)

<!-- steps -->
## Crea un account
Apri la [OpenAI Platform](https://platform.openai.com) e registrati o accedi.

## Aggiungi un metodo di pagamento
In **Settings**, sotto **Organization**, apri **Billing**, aggiungi una carta e acquista un piccolo credito per iniziare. Lascia disattivata la ricarica automatica.

## Imposta un limite di spesa
Nello stesso posto, apri **Limits** e imposta un limite di spesa mensile rigido (hard limit). Un avviso di spesa invia solo un’e-mail; è il limite rigido che ferma le richieste quando viene raggiunto.

## Crea la chiave
Apri [API keys](https://platform.openai.com/api-keys), crea una nuova chiave segreta e dalle un nome come «Hemmia telefono». Copiala subito: viene mostrata una sola volta.
<!-- /steps -->

## Usare la chiave

Sul telefono, incolla la chiave in Hemmia e tocca **Verifica e salva** (vedi [Hemmia sul telefono](/it/guides/phone/)). Su un hub a casa, ognuno aggiunge la propria chiave in **Impostazioni → Modelli → IA cloud**; un hub può usare anche OpenRouter (vedi [Scegliere i modelli di IA](/it/guides/models/)).

## Tenere la chiave al sicuro

<!-- note -->
Tratta la chiave come una password: chi ce l’ha può usare il tuo credito. Non inviarla mai in una chat, in un’e-mail o in uno screenshot.
<!-- /note -->

- Sul telefono, Hemmia conserva la chiave nel portachiavi sicuro del telefono e la mostra solo accorciata. Non è nelle esportazioni delle chat.
- Se pensi che qualcun altro abbia la tua chiave, eliminala nella console del fornitore e creane una nuova. Poi usa **Sostituisci** nelle impostazioni di Hemmia.
- Usa una chiave per dispositivo o per hub. Così puoi eliminarne una senza toccare le altre.
