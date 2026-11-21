---
title: So funktioniert es
description: Deine eigene KI auf einem Computer zu Hause, die Hemmia-App auf euren Telefonen und die zwei Wege, wie sie sich erreichen.
nav: how
order: 10
---

# So funktioniert es

Hemmia läuft auf einem Computer zu Hause, dem *Hub*. Die ganze Familie nutzt ihn mit der Hemmia-App auf dem Telefon oder im Browser auf Tablet und Laptop. Die App verbindet sich mit dem Hub, zu Hause und unterwegs.

<!-- diagram name="how" -->

## Der Hub zu Hause

Der Hub ist ein Mac oder ein Computer, auf dem Docker läuft, etwa ein PC oder ein NAS. Du installierst Hemmia einmal darauf, und er bleibt an.

- **Lokale Modelle** laufen über Ollama oder LM Studio direkt auf dem Hub. Nichts, was du schreibst, verlässt das Haus. Sie sind langsamer und können weniger als die besten Cloud-Modelle, werden aber schnell besser.
- **Cloud-Modelle** sind freiwillig: Jede Person kann ihren eigenen Schlüssel von Anthropic, OpenAI oder OpenRouter eintragen. Er wird mit ihrer Passphrase verschlüsselt gespeichert, niemand sonst kann ihn sehen oder nutzen. Chats mit diesen Modellen gehen an den jeweiligen Anbieter.
- **Konten pro Person.** Die Chats jeder Person sind mit einem Schlüssel verschlüsselt, der aus ihrer eigenen Passphrase entsteht. Wer den Hub betreut, kann die Chats der anderen nicht lesen.

<!-- screenshot name="hub-chat" alt="Ein Chat auf dem Hub im Browser: eine Frage nach Essensideen und die Antwort mit drei Vorschlägen; frühere Chats in der Seitenleiste" -->

## Wie die App den Hub erreicht

Aus Sicherheitsgründen antwortet der Hub nur auf seinem eigenen Computer. Damit eure Telefone hineinkommen, zu Hause und unterwegs, braucht er eine geschützte Verbindung. Du wählst eine von zwei:

- **Tailscale: kostenlos, mit etwas Einrichtung.** Tailscale ist ein privates Netz (ein VPN), das für die private Nutzung kostenlos ist. Du legst ein Tailscale-Konto an, installierst Tailscale auf dem Computer des Hubs und die Tailscale-App auf jedem Telefon, meldest alle im selben Netz an und schaltest einmal HTTPS ein. Danach läuft es von selbst. [Schritt für Schritt](/de/guides/remote/)
- **Hemmia Connect: fertig mit einem Schalter.** Für alle, die nichts einrichten möchten. Schalte es bei der Einrichtung des Hubs ein, und dein Hub bekommt eine eigene Adresse; Telefone kommen dazu, indem sie einen Code scannen, ohne zusätzliche App. Unser Relay leitet den Verkehr weiter, ohne ihn lesen zu können: Die Verbindung ist vom Telefon bis zum Hub verschlüsselt. Während der Beta ist Connect kostenlos.

Du kannst mit einem anfangen und später wechseln. Oder du verzichtest auf beides und nutzt Hemmia nur im Browser auf dem Computer des Hubs.

## Ohne Hub: nur die App

Wenn du keinen Computer hast, der anbleiben kann, funktioniert die Hemmia-App auch allein. Sie spricht dann direkt mit dem KI-Anbieter, den du gewählt hast, Anthropic (Claude) oder OpenAI, mit deinem eigenen Schlüssel. Dazwischen ist kein Server von uns.

- Dein Schlüssel liegt im sicheren Speicher des Telefons (der Schlüsselbund des iPhones) und verlässt das Telefon nur in Richtung Anbieter.
- Deine Chats werden verschlüsselt auf dem Telefon gespeichert.
- Du bezahlst den Anbieter für das, was du nutzt. Ein normaler Tag mit Chatten kostet ein paar Cent.

Einen Hub kannst du später dazunehmen.

[Datenschutz, einfach erklärt](/de/privacy/) · [Fragen und Antworten](/de/faq/)
