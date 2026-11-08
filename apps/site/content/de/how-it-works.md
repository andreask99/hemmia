---
title: So funktioniert es
description: Die zwei Wege, Hemmia zu nutzen, was wo läuft und wie dein Telefon deinen Hub erreicht.
nav: how
order: 10
---

# So funktioniert es

Es gibt zwei Wege, Hemmia zu nutzen. Du kannst mit einem anfangen und später wechseln.

<!-- diagram name="how" -->

## Auf dem Telefon

Die Hemmia-App spricht direkt mit dem KI-Anbieter, den du gewählt hast, Anthropic (Claude) oder OpenAI, mit deinem eigenen Schlüssel. Dazwischen ist kein Server von uns.

- Dein Schlüssel liegt im sicheren Speicher des Telefons (der Schlüsselbund des iPhones) und verlässt das Telefon nur in Richtung Anbieter.
- Deine Chats werden verschlüsselt auf dem Telefon gespeichert.
- Du bezahlst den Anbieter für das, was du nutzt. Ein normaler Tag mit Chatten kostet ein paar Cent.

## Zu Hause

Ein *Hub* ist der Computer zu Hause, auf dem Hemmia läuft: ein Mac oder ein Computer, auf dem Docker läuft, etwa ein PC oder ein NAS. Er bleibt an, und die ganze Familie nutzt ihn von Telefon, Tablet und Laptop.

- **Lokale Modelle** laufen über Ollama oder LM Studio direkt auf dem Hub. Nichts, was du schreibst, verlässt das Haus. Sie sind langsamer und können weniger als die besten Cloud-Modelle, werden aber schnell besser.
- **Cloud-Modelle** sind freiwillig: Jede Person kann ihren eigenen Schlüssel von Anthropic, OpenAI oder OpenRouter eintragen. Er wird mit ihrer Passphrase verschlüsselt gespeichert, niemand sonst kann ihn sehen oder nutzen. Chats mit diesen Modellen gehen an den jeweiligen Anbieter.
- **Konten pro Person.** Die Chats jeder Person sind mit einem Schlüssel verschlüsselt, der aus ihrer eigenen Passphrase entsteht. Wer den Hub betreut, kann die Chats der anderen nicht lesen.

<!-- screenshot name="hub-chat" alt="Ein Chat auf dem Hub im Browser: eine Frage nach Essensideen und die Antwort mit drei Vorschlägen; frühere Chats in der Seitenleiste" -->

## Deinen Hub von überall erreichen

Der Hub antwortet nur auf seinem eigenen Computer. Damit Telefone ihn erreichen, zu Hause und unterwegs, gibt es zwei Möglichkeiten:

- **Hemmia Connect.** Dein Hub bekommt eine eigene Adresse. Unser Relay leitet den Verkehr weiter, ohne ihn lesen zu können: Die Verbindung ist vom Telefon bis zum Hub verschlüsselt.
- **Tailscale.** Ein privates Netz, das du selbst verwaltest. Jedes Telefon braucht die Tailscale-App.

Du kannst auch auf beides verzichten und Hemmia nur im Browser auf dem Computer des Hubs nutzen.

[Datenschutz, einfach erklärt](/de/privacy/) · [Fragen und Antworten](/de/faq/)
