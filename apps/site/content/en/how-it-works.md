---
title: How it works
description: Your own AI on a computer at home, the Hemmia app on your phones, and the two ways they reach each other.
nav: how
order: 10
---

# How it works

Hemmia runs on a computer at home, the *hub*. Everyone in the family uses it from the Hemmia app on their phone, or from a browser on a tablet or laptop. The app connects to the hub, at home and on the go.

<!-- diagram name="how" -->

## The hub at home

The hub is a Mac, or any computer that can run Docker, like a PC or a NAS. You install Hemmia on it once, and it stays on.

- **Local models** run on the hub itself through Ollama or LM Studio. Nothing you write leaves the house. They are slower and less capable than the best cloud models, but they are getting better quickly.
- **Cloud models** are optional: each person can add their own key from Anthropic, OpenAI or OpenRouter. The key is stored encrypted with that person's passphrase, so nobody else can see or use it. Chats with these models go to that provider.
- **Accounts per person.** Each person's chats are encrypted with a key that comes from their own passphrase. The person who runs the hub can't read the others' chats.

<!-- screenshot name="hub-chat" alt="A chat on the hub in the browser: a question about dinner ideas and the answer with three suggestions; earlier chats in the sidebar" -->

## How the app reaches the hub

For safety, the hub only answers on its own computer. To let your phones in, at home and away, it needs a protected connection. You choose one of two:

- **Tailscale: free, with a bit of setup.** Tailscale is a private network (a VPN) that is free for personal use. You create a Tailscale account, install Tailscale on the hub's computer and the Tailscale app on every phone, sign them all in to the same network and turn on HTTPS once. After that it runs by itself. [Step by step](/guides/remote/)
- **Hemmia Connect: ready with one switch.** For everyone who'd rather not set anything up. Turn it on in the hub's setup, and your hub gets its own address; phones join by scanning a code, with nothing extra to install. Our relay passes the traffic on without being able to read it: the connection is encrypted all the way from your phone to your hub. Connect is free during the beta.

You can start with one and switch to the other later. Or skip both and use Hemmia only in a browser on the hub's computer.

## Without a hub: just the app

If you don't have a computer that can stay on, the Hemmia app also works on its own. It then talks directly to the AI provider you chose, Anthropic (Claude) or OpenAI, with your own key. There is no server of ours in between.

- Your key is kept in the phone's secure storage (the Keychain on the iPhone) and never leaves the phone except to the provider.
- Your chats are saved on the phone, encrypted.
- You pay the provider for what you use. A typical day of chatting costs a few cents.

You can add a hub later.

[Privacy, explained](/privacy/) · [Questions and answers](/faq/)
