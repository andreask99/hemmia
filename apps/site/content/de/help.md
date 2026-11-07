---
title: Hilfe
description: Was du tun kannst, wenn der Hub nicht erreichbar ist, ein Einrichtungslink abgelaufen ist, du deine Passphrase vergessen hast, ein Modell langsam ist oder ein Schlüssel abgelehnt wird.
nav: help
order: 90
draft: true
---

# Hilfe

## Die App sagt, der Hub ist nicht erreichbar

Die App zeigt, was du prüfen kannst, und wann dieses Telefon den Hub zuletzt erreicht hat.

- Ist der Computer eingeschaltet und wach? Ein Mac im Ruhezustand kann nicht antworten.
- Hat er Internet?
- Ist Hemmia Connect oder Tailscale eingeschaltet? Telefone erreichen den Hub nur über eins davon, auch zu Hause: siehe [Unterwegs](/de/guides/remote/).

Tippe auf **Erneut versuchen**, wenn der Computer wieder läuft, oder auf **Zu einem anderen Hub wechseln**, um einen anderen Hub zu öffnen.

## Der Einrichtungslink funktioniert nicht

Die Einrichtungsseite braucht den Link, den der Installer geöffnet hat. Steht dort **Öffne den Einrichtungslink aus dem Installer**, öffne die Seite noch einmal aus dem Installer. Ein Einrichtungslink ist 24 Stunden gültig. Auf dem Mac führst du den Installer noch einmal aus: Er startet Hemmia neu und öffnet die Einrichtungsseite mit einem neuen Link (oder mit dem bisherigen, wenn er noch gilt). Mit Docker gibst du `docker compose restart hub` ein und öffnest den neuen Link aus `docker compose logs hub`.

## Ich habe meine Passphrase vergessen

Tippe auf der Anmeldeseite auf **Passphrase vergessen?** und gib deinen Benutzernamen, deinen Wiederherstellungscode und eine neue Passphrase ein. Danach bekommst du einen neuen Wiederherstellungscode; der alte gilt nicht mehr. Schreib den neuen auf.

<!-- note -->
Niemand sonst kann deine Passphrase zurücksetzen, auch kein Admin: Deine Chats sind damit verschlüsselt. Ohne Passphrase und Wiederherstellungscode lässt sich dein Konto nicht mehr öffnen. Ein Admin kann dann das alte Konto unter **Einstellungen → Familie** **Deaktivieren** und dich neu einladen: Du beginnst mit einem neuen, leeren Konto unter einem anderen Benutzernamen.
<!-- /note -->

## Ein Modell ist sehr langsam

Lokale Modelle laufen auf dem Computer des Hubs, und große Modelle brauchen viel Arbeitsspeicher. Unter **Einstellungen → Modelle** markiert Hemmia die Modelle, die zu deinem Computer passen. Nimm ein kleineres oder für lange oder schwierige Fragen ein Cloud-Modell. Siehe [KI-Modelle auswählen](/de/guides/models/).

## Mein Schlüssel wird abgelehnt

- **Dieser Schlüssel wurde abgelehnt:** Prüfe, ob du ihn vollständig kopiert hast, ohne Leerzeichen am Anfang oder Ende. Klappt es dann immer noch nicht, erstelle einen neuen Schlüssel in der Console des Anbieters.
- **Dein Schlüssel hat sein Limit erreicht:** Du bist an das Ratenlimit des Anbieters oder an dein Ausgabenlimit gestoßen. Versuch es später noch einmal oder erhöhe das Limit in der Console.
- **Der Anbieter ist ausgelastet:** Versuch es in einer Minute noch einmal.

## Benachrichtigungen kommen nicht an

<!-- CHECK: schreiben, sobald Push (P5.6) auf echten Telefonen getestet ist -->
