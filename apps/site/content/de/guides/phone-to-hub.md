---
title: Telefon verbinden
description: Die Hemmia-App per QR-Code mit deinem Hub verbinden, weitere Geräte anmelden und zwischen Hubs wechseln.
nav: guides
order: 60
draft: true
---

# Telefon verbinden

Die Hemmia-App verbindet sich per QR-Code mit deinem Hub. Dein Telefon wird dabei mit deinem Konto angemeldet; eine Passphrase musst du auf dem Telefon nicht eintippen.

## Bei der Einrichtung

Der letzte Schritt der Einrichtung, **Telefon hinzufügen**, zeigt einen QR-Code. Öffne die Hemmia-App auf deinem Telefon, tippe auf **Code scannen** und halte die Kamera darauf.

## Später oder für ein weiteres Gerät

<!-- steps -->
## Kontoeinstellungen öffnen
Öffne auf einem Gerät, das schon angemeldet ist, **Einstellungen → Konto** und such den Bereich **Anderes Gerät anmelden**.

## Code zeigen
Gib deine Passphrase ein und tippe auf **Anmeldecode zeigen**. Der Code ist 10 Minuten gültig und lässt sich einmal verwenden.

## Scannen
Tippe in der Hemmia-App auf dem anderen Telefon auf **Code scannen**. Auf einem Computer, oder um Hemmia im Browser des Telefons zu nutzen, tippst du stattdessen neben dem Link auf **Kopieren** und öffnest ihn dort im Browser.
<!-- /steps -->

Steht dort, dass andere Geräte diesen Computer noch nicht erreichen können, schalte zuerst Hemmia Connect ein oder richte Tailscale ein: siehe [Unterwegs](/de/guides/remote/).

Admins können auch für andere ein Gerät hinzufügen: **Einstellungen → Familie**, dann **Geräte** neben der Person und **Gerät für … hinzufügen**. Dieser Code ist 24 Stunden gültig. Für ein neues Konto nimmst du stattdessen eine Einladung: siehe [Familie einladen](/de/guides/family/).

## Was „verbunden“ heißt

Ist das Telefon verbunden, öffnet die App direkt deinen Hub. Ist der Hub nicht erreichbar, sagt die App das und zeigt, was du prüfen kannst: ob der Computer eingeschaltet und wach ist und ob er Internet hat. Deine Chats liegen auf dem Hub, deshalb siehst du sie nicht, solange er nicht erreichbar ist.

<!-- screenshot name="phone-chat" alt="Ein Chat vom Hub auf dem Telefon" -->

## Mehrere Hubs

Die App kann mehrere Hubs speichern, zum Beispiel deinen und den deiner Eltern. Mit **Weiteren Hub hinzufügen** in der Liste der Hubs fügst du einen hinzu; mit **Hub wechseln** in den Einstellungen eines Hubs kommst du zurück zur Liste. Nutzt du die App auch allein, ist **Auf diesem Telefon** die erste Zeile dieser Liste.

## Ohne die App

Hemmia funktioniert auch im Browser des Telefons. Öffne den kopierten Link in Safari (oder Chrome auf Android) und leg ihn auf den Home-Bildschirm: in Safari **Teilen → Zum Home-Bildschirm**. Mitteilungen schaltest du dort unter **Einstellungen → Konto → Mitteilungen** ein.

## Ein Telefon entfernen

Unter **Einstellungen → Konto → Geräte** entfernst du ein Telefon, das du nicht mehr nutzt oder verloren hast. Es wird sofort abgemeldet und braucht einen neuen Code, um sich wieder anzumelden.
