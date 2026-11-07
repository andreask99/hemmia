---
title: Familie einladen
description: Gib jeder Person ihr eigenes Konto per QR-Code oder Link und verwalte Konten und Geräte.
nav: guides
order: 70
---

# Familie einladen

Alle bekommen ihr eigenes Konto mit eigener Passphrase. Admins verwalten die Konten, aber niemand außer der Person selbst kann ihre Chats lesen.

<!-- steps -->
## Einladung erstellen
Öffne in Hemmia **Einstellungen → Familie** und tippe auf **Einladungslink erstellen**. Wähle **Admin-Konto** für einen weiteren Elternteil oder **Teenager-Konto (eingeschränkt)** für ein Kind.

## Scannen lassen oder Link senden
Hemmia zeigt einen QR-Code. Die Person scannt ihn mit der Kamera ihres Telefons, oder du tippst auf **Einladungslink senden** und schickst ihn über einen Messenger. Die Einladung funktioniert einmal und 7 Tage lang.

<!-- screenshot name="hub-invite" alt="Einstellungen, Familie: eine neue Einladung als QR-Code, mit dem Knopf Einladungslink senden und dem Link selbst" -->

## Konto anlegen
Die Person wählt einen Benutzernamen und eine Passphrase und bekommt einen Wiederherstellungscode, den sie gut aufbewahren sollte.
<!-- /steps -->

<!-- note -->
Einladungslinks funktionieren nur, wenn andere Geräte deinen Hub erreichen können: Schalte zuerst Hemmia Connect ein oder richte Tailscale ein.
<!-- /note -->

## Eingeschränkte Konten

Ein eingeschränktes Konto passt für Teenager: Admins legen unter **Einstellungen → Familie** fest, ob eingeschränkte Konten Websuche und Cloud-Modelle nutzen dürfen. Die Einschränkung lässt sich für jedes Konto später setzen oder aufheben.

<!-- screenshot name="hub-family" alt="Einstellungen, Familie: drei Konten, eins davon als eingeschränkt markiert, jeweils mit Knöpfen zum Deaktivieren, Einschränken und für die Geräte" -->

## Geräte

Unter **Einstellungen → Konto → Geräte** sieht jede Person ihre Geräte, fügt per QR-Code ein weiteres hinzu und entfernt ein verlorenes Telefon. Admins können das unter **Einstellungen → Familie** auch für andere tun. Ein entferntes Gerät wird sofort abgemeldet und braucht einen neuen Link.

## Konto deaktivieren

**Deaktivieren** verhindert, dass sich ein Konto anmeldet, ohne etwas zu löschen. **Aktivieren** macht es wieder nutzbar.
