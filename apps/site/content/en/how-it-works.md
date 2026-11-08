---
title: How it works
description: The two ways to use Hemmia, what runs where, and how your phone reaches your hub.
nav: how
order: 10
---

# How it works

Hemmia comes in two ways. You can start with one and move to the other later.

<!-- diagram name="how" -->

## On this phone

The Hemmia app talks directly to the AI provider you chose, Anthropic (Claude) or OpenAI, with your own key. There is no server of ours in between.

- Your key is kept in the phone's secure storage (the Keychain on the iPhone) and never leaves the phone except to the provider.
- Your chats are saved on the phone, encrypted.
- You pay the provider for what you use. A typical day of chatting costs a few cents.

## At home

A *hub* is the computer at home that runs Hemmia: a Mac, or any computer that can run Docker, like a PC or a NAS. It stays on, and everyone in the family uses it from their phones, tablets and laptops.

- **Local models** run on the hub itself through Ollama or LM Studio. Nothing you write leaves the house. They are slower and less capable than the best cloud models, but they are getting better quickly.
- **Cloud models** are optional: each person can add their own key from Anthropic, OpenAI or OpenRouter. The key is stored encrypted with that person's passphrase, so nobody else can see or use it. Chats with these models go to that provider.
- **Accounts per person.** Each person's chats are encrypted with a key that comes from their own passphrase. The person who runs the hub can't read the others' chats.

<!-- screenshot name="hub-chat" alt="A chat on the hub in the browser: a question about dinner ideas and the answer with three suggestions; earlier chats in the sidebar" -->

## Reaching your hub from anywhere

The hub only answers on its own computer. For phones to reach it, at home and away, there are two options:

- **Hemmia Connect.** Your hub gets its own address. Our relay passes the traffic on without being able to read it: the connection is encrypted all the way from your phone to your hub.
- **Tailscale.** A private network you manage yourself. Every phone needs the Tailscale app.

You can also skip both and use Hemmia only in a browser on the hub's computer.

[Privacy, explained](/privacy/) · [Questions and answers](/faq/)
