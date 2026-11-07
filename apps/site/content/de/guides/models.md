---
title: KI-Modelle auswählen
description: Lokale Modelle auf deinem Hub, weitere lokale Server wie LM Studio und Cloud-Modelle mit deinem eigenen Schlüssel.
nav: guides
order: 50
---

# KI-Modelle auswählen

Hemmia kann zwei Arten von Modellen nutzen, und du kannst sie mischen: Für jeden Chat wählst du ein Modell.

| | Lokale Modelle | Cloud-Modelle |
| --- | --- | --- |
| Wo sie laufen | Auf deinem Hub | Beim Anbieter (Anthropic, OpenAI, OpenRouter) |
| Deine Nachrichten | Bleiben im Haus | Gehen an den Anbieter, bei den Chats, in denen du sie wählst |
| Kosten | Strom | Du bezahlst den Anbieter für deinen Verbrauch |
| Tempo und Können | Gut für den Alltag, auf kleinen Computern langsamer | Die stärksten verfügbaren Modelle |

## Lokale Modelle

Lokale Modelle brauchen [Ollama](https://ollama.com) auf dem Hub. Je mehr Arbeitsspeicher dein Computer hat, desto größere (und bessere) Modelle kann er ausführen.

<!-- steps -->
## Modell-Einstellungen öffnen
Öffne in Hemmia **Einstellungen → Modelle**. Admins sehen den Bereich **Für die ganze Familie**.

## Modell auswählen
Unter **Modell hinzufügen** zeigt Hemmia Modelle, die zum Arbeitsspeicher deines Computers passen; das passendste ist als **Empfohlen** markiert. Modelle, die mehr Speicher brauchen, sind ausgegraut.

## Herunterladen
Tippe auf **Herunterladen**. Ein Modell hat einige Gigabyte, das kann dauern; du kannst die Seite verlassen, der Download läuft weiter.
<!-- /steps -->

Danach steht das Modell allen in der Modellauswahl zur Verfügung. Jede Person kann ihr eigenes **Standardmodell für neue Chats** festlegen.

### LM Studio und andere lokale Server

Wenn du schon LM Studio, llama.cpp oder vLLM auf diesem Computer oder einem anderen in deinem Heimnetz betreibst, trag ihn unter **Weitere lokale Server** mit seiner Adresse ein. Seine Modelle erscheinen dann auch in Hemmia.

## Cloud-Modelle mit deinem eigenen Schlüssel

Jede Person trägt ihren eigenen Schlüssel ein. Er wird mit ihrer Passphrase verschlüsselt gespeichert; niemand sonst, auch nicht die Admin-Person, kann ihn sehen oder nutzen.

<!-- steps -->
## Schlüssel besorgen
Erstelle einen API-Schlüssel bei deinem Anbieter: Anthropic unter platform.claude.com, OpenAI unter platform.openai.com oder OpenRouter unter openrouter.ai. Leg dort auch ein monatliches Ausgabenlimit fest.

## In Hemmia eintragen
Öffne **Einstellungen → Modelle → Cloud-KI**, wähle den Anbieter, füge den Schlüssel ein und tippe auf **Prüfen und speichern**. Hemmia prüft den Schlüssel beim Anbieter, ohne einen deiner Chats zu senden.

## Wenn du magst, ein Limit setzen
Unter **Monatliches Limit in US-Dollar** hört Hemmia auf, Cloud-Modelle für dich zu nutzen, sobald deine geschätzten Ausgaben das Limit erreichen.
<!-- /steps -->

<!-- note -->
Nur Chats, in denen du ein Cloud-Modell wählst, gehen an den Anbieter, mit dem, was das Modell zum Antworten braucht: dem bisherigen Chat samt Fotos und Dokumenten. Chats mit lokalen Modellen verlassen das Haus nie.
<!-- /note -->
