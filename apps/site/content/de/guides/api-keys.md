---
title: API-Schlüssel besorgen
description: Einen Schlüssel bei Anthropic oder OpenAI erstellen, ein monatliches Ausgabenlimit setzen und den Schlüssel sicher aufbewahren.
nav: guides
order: 20
draft: true
---

# API-Schlüssel besorgen

Mit einem API-Schlüssel nutzt Hemmia die Modelle eines Anbieters in deinem Namen. Du bezahlst den Anbieter direkt für das, was du nutzt; Hemmia schlägt nichts drauf. Ein normaler Tag mit Chats kostet ein paar Cent.

Der Schlüssel ist unabhängig von einem ChatGPT- oder Claude-Abo: Auch wenn du eins hast, brauchst du ein Konto auf der Entwicklerplattform des Anbieters und dort eine Zahlungsmethode.

## Anthropic (Claude-Modelle)

<!-- steps -->
## Konto anlegen
Öffne die [Claude Console](https://platform.claude.com) und registriere dich oder melde dich an.

## Zahlungsmethode hinzufügen
Öffne **Settings → Billing**, hinterlege eine Karte und kaufe für den Anfang ein kleines Guthaben, zum Beispiel fünf Dollar. Lass das automatische Aufladen aus: Dann kannst du nie mehr ausgeben als das gekaufte Guthaben.

## Ausgabenlimit setzen
Wähle auf derselben **Billing**-Seite unter **Spend limits** **Set limit** und gib einen Monatsbetrag ein, zum Beispiel zehn Dollar. Ist er erreicht, laufen bis zum Beginn des nächsten Monats keine Anfragen mehr, und es entstehen keine weiteren Kosten.

## Schlüssel erstellen
Öffne [API keys](https://platform.claude.com/settings/keys), erstelle einen Schlüssel und gib ihm einen Namen wie „Hemmia Telefon“. Kopiere ihn sofort: Die Console zeigt ihn nur einmal.
<!-- /steps -->

## OpenAI (GPT-Modelle)

<!-- steps -->
## Konto anlegen
Öffne die [OpenAI Platform](https://platform.openai.com) und registriere dich oder melde dich an.

## Zahlungsmethode hinzufügen
Öffne in **Settings** unter **Organization** den Punkt **Billing**, hinterlege eine Karte und kaufe für den Anfang ein kleines Guthaben. Lass das automatische Aufladen aus.

## Ausgabenlimit setzen
Öffne dort **Limits** und setz ein monatliches hartes Ausgabenlimit (Hard spend limit). Eine Ausgabenwarnung (Spend alert) schickt nur eine E-Mail; erst das harte Limit stoppt die Anfragen, wenn es erreicht ist.

## Schlüssel erstellen
Öffne [API keys](https://platform.openai.com/api-keys), erstelle einen neuen Secret Key und gib ihm einen Namen wie „Hemmia Telefon“. Kopiere ihn sofort: Er wird nur einmal angezeigt.
<!-- /steps -->

## Den Schlüssel verwenden

Auf dem Telefon fügst du den Schlüssel in Hemmia ein und tippst auf **Prüfen und speichern** (siehe [Hemmia auf dem Telefon](/de/guides/phone/)). Auf einem Hub zu Hause trägt jede Person ihren eigenen Schlüssel unter **Einstellungen → Modelle → Cloud-KI** ein; ein Hub kann auch OpenRouter nutzen (siehe [KI-Modelle auswählen](/de/guides/models/)).

## Den Schlüssel sicher aufbewahren

<!-- note -->
Behandle den Schlüssel wie ein Passwort: Wer ihn hat, kann dein Guthaben verbrauchen. Verschick ihn nie per Chat oder E-Mail, und zeig ihn auf keinem Screenshot.
<!-- /note -->

- Auf dem Telefon bewahrt Hemmia den Schlüssel im sicheren Schlüsselbund des Telefons auf und zeigt ihn nur gekürzt. In Chat-Exporten ist er nicht enthalten.
- Wenn du glaubst, dass jemand anderes deinen Schlüssel hat, lösche ihn in der Console des Anbieters und erstelle einen neuen. Tippe dann in Hemmias Einstellungen auf **Ersetzen** und füge den neuen ein.
- Nimm einen Schlüssel pro Gerät oder Hub. Dann kannst du einen löschen, ohne dass die anderen betroffen sind.
