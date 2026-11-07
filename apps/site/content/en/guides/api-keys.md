---
title: Getting an API key
description: Create a key at Anthropic or OpenAI, set a monthly spending limit and keep the key safe.
nav: guides
order: 20
draft: true
---

# Getting an API key

An API key lets Hemmia use a provider's models in your name. You pay the provider directly for what you use; Hemmia adds nothing. A typical day of chatting costs a few cents.

The key is separate from a ChatGPT or Claude subscription: even if you have one, you need an account on the provider's developer platform and a payment method there.

## Anthropic (Claude models)

<!-- steps -->
## Create an account
Open the [Claude Console](https://platform.claude.com) and sign up or sign in.

## Add a payment method
Open **Settings → Billing**, add a card and buy a small amount of credit to start, for example five dollars. Leave automatic reload off: then you can never spend more than the credit you bought.

## Set a spending limit
On the same **Billing** page, under **Spend limits**, choose **Set limit** and enter a monthly amount, for example ten dollars. When it is reached, requests stop until the next month begins instead of costing more.

## Create the key
Open [API keys](https://platform.claude.com/settings/keys), create a key and give it a name like "Hemmia phone". Copy it right away: the console shows it only once.
<!-- /steps -->

## OpenAI (GPT models)

<!-- steps -->
## Create an account
Open the [OpenAI Platform](https://platform.openai.com) and sign up or sign in.

## Add a payment method
In **Settings**, under **Organization**, open **Billing**, add a card and buy a small amount of credit to start. Leave automatic recharge off.

## Set a spending limit
In the same place, open **Limits** and set a monthly hard spend limit. A spend alert only sends an email; the hard limit is what stops requests when it is reached.

## Create the key
Open [API keys](https://platform.openai.com/api-keys), create a new secret key and give it a name like "Hemmia phone". Copy it right away: it is shown only once.
<!-- /steps -->

## Using the key

On your phone, paste the key in Hemmia and tap **Check and save** (see [Hemmia on your phone](/guides/phone/)). On a hub at home, each person adds their own key under **Settings → Models → Cloud AI**; a hub can also use OpenRouter (see [Choosing AI models](/guides/models/)).

## Keeping the key safe

<!-- note -->
Treat the key like a password: anyone who has it can use your credit. Never send it in a chat, an email or a screenshot.
<!-- /note -->

- On the phone, Hemmia keeps the key in the phone's secure keychain and shows it only shortened. It is not in chat exports.
- If you think someone else has your key, delete it in the provider's console and create a new one. Then use **Replace** in Hemmia's settings.
- Use one key per device or hub. Then you can delete one without affecting the others.
