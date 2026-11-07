---
title: Questions and answers
description: Short answers about cost, privacy, models, the relay and open source.
nav: faq
order: 90
---

# Questions and answers

## Is Hemmia free?

Yes. There is no subscription and no account with us. If you use cloud models, you pay the provider (Anthropic, OpenAI or OpenRouter) directly for what you use. Local models on your hub cost only electricity.

## What does it cost to use cloud models?

It depends on how much you write and which model you choose. A typical day of chatting costs a few cents. Providers let you set a monthly spending limit, and we recommend doing that.

## Do you see my chats?

No. Your chats are stored on your hub or your phone, encrypted. We don't run a server that keeps them, and our relay can't read the traffic it passes on. See [Privacy, explained](/privacy/).

## Which AI models can I use?

On a hub: local models through Ollama or LM Studio, and cloud models from Anthropic, OpenAI and OpenRouter with a key. On the phone alone: Anthropic and OpenAI with your own key. You can pick a different model for each chat.

## How good are local models?

Good for everyday questions, writing and summaries, and they keep everything at home. The best cloud models are still faster and more capable for hard tasks. Hemmia recommends local models that fit your computer's memory.

## What computer do I need for a hub?

A Mac with Apple silicon (16 GB of memory or more is best for local models), or any computer that runs Docker, such as a PC, a NAS or a Raspberry Pi. If you only use cloud models, a small computer is enough. It needs to stay on.

## Why is there a relay?

So your phone can reach your hub, at home and away, without opening your router or setting anything up. The relay only passes encrypted traffic on. If you prefer, use Tailscale instead.

## Can my children use it?

Yes. Each person has their own account and their own private chats. Admins can restrict accounts, for example to turn off web search.

## What happens if I lose my passphrase?

Use your recovery code, which you saved when you created your account. Without passphrase and recovery code, nobody can open your chats, not even the person who runs the hub.

## Is Hemmia open source?

It will be: the code will be published under the AGPL licence, so that anyone can check what it does and how it protects your data.
