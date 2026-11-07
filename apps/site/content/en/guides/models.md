---
title: Choosing AI models
description: Local models on your hub, other local servers like LM Studio, and cloud models with your own key.
nav: guides
order: 50
---

# Choosing AI models

Hemmia can use two kinds of models, and you can mix them: pick a model for each chat.

| | Local models | Cloud models |
| --- | --- | --- |
| Where they run | On your hub | At the provider (Anthropic, OpenAI, OpenRouter) |
| Your messages | Stay in the house | Go to the provider for the chats where you pick them |
| Cost | Electricity | You pay the provider for what you use |
| Speed and ability | Good for everyday things, slower on small computers | The strongest models available |

## Local models

Local models need [Ollama](https://ollama.com) on the hub. The more memory your computer has, the bigger (and better) the models it can run.

<!-- steps -->
## Open the models settings
In Hemmia, open **Settings → Models**. Admins see the section **For the whole family**.

## Pick a model
Under **Add a model**, Hemmia lists models that fit your computer's memory, with the best fit marked **Recommended**. Models that need more memory are greyed out.

## Download it
Tap **Download**. A model is a few gigabytes, so this can take a while; you can leave the page, the download carries on.
<!-- /steps -->

Once downloaded, the model appears in everyone's model list. Each person can set their own **Default model for new chats**.

### LM Studio and other local servers

If you already run LM Studio, llama.cpp or vLLM on this computer or another one in your home network, add it under **Other local servers** with its address. Its models then show up in Hemmia too.

## Cloud models with your own key

Each person adds their own key; it is stored encrypted with their passphrase, so nobody else, not even the admin, can see or use it.

<!-- steps -->
## Get a key
Create an API key with your provider: Anthropic at platform.claude.com, OpenAI at platform.openai.com, or OpenRouter at openrouter.ai. Set a monthly spending limit there too.

## Add it in Hemmia
Open **Settings → Models → Cloud AI**, choose the provider, paste the key and tap **Check and save**. Hemmia checks the key with the provider without sending any of your chats.

## Optionally, set a limit
Under **Monthly limit in US dollars**, Hemmia can stop using cloud models for you once your estimated spending reaches the limit.
<!-- /steps -->

<!-- note -->
Only chats where you pick a cloud model go to the provider, with what the model needs to answer: the chat so far and its photos and documents. Chats with local models never leave the house.
<!-- /note -->
