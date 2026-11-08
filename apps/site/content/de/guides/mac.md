---
title: Hemmia auf einem Mac einrichten
description: Den Hub auf einem Mac mit Apple-Chip installieren, im Browser einrichten und dein Telefon verbinden.
nav: guides
order: 20
draft: true
---

# Hemmia auf einem Mac einrichten

Der Hub ist der Computer zu Hause, auf dem Hemmia für deine Familie läuft. Ein Mac eignet sich gut: Er ist leise, braucht wenig Strom, und Macs mit Apple-Chip führen lokale KI-Modelle schnell aus.

## Was du brauchst

- Einen Mac mit Apple-Chip (M1 oder neuer) und macOS 14 oder neuer.
- 16 GB Arbeitsspeicher oder mehr, wenn du lokale Modelle nutzen willst; für nur Cloud-Modelle reichen 8 GB.
- Etwa 20 GB freien Speicherplatz für ein lokales Modell.
- Der Mac sollte eingeschaltet bleiben. Hemmia verhindert den Ruhezustand, solange Telefone ihn erreichen müssen.

<!-- steps -->
## Herunterladen und installieren
Lade das Hemmia-Hub-Paket von der [Download-Seite](/de/download/) und öffne es. Der Installer fragt nach deinem Mac-Passwort, weil das Programm in den Application-Support-Ordner des Systems kommt.

## Im Browser einrichten
Wenn der Installer fertig ist, öffnet dein Browser die Hemmia-Einrichtung. Gib deiner Familie einen Namen, leg dein eigenes Konto an und schreib den Wiederherstellungscode auf. Hast du die Seite geschlossen oder mehr als einen Tag gewartet, führ den Installer noch einmal aus: Er öffnet die Einrichtung mit einem neuen Link.

<!-- screenshot name="mac-setup-welcome" alt="Der erste Schritt der Einrichtung: Willkommen bei Hemmia, mit Arbeitsspeicher und Speicherplatz des Macs und einem Feld für den Familiennamen" -->


## Deine KI wählen
Wähle ein empfohlenes lokales Modell zum Herunterladen, trag einen Cloud-Schlüssel ein, oder beides. Das kannst du später unter Einstellungen → Modelle ändern.

<!-- screenshot name="mac-setup-models" alt="Die Modellliste in der Einrichtung: empfohlene lokale Modelle mit ihrer Downloadgröße, einige schon heruntergeladen" -->


## Für Telefone erreichbar machen
Telefone erreichen den Hub nur über Hemmia Connect oder Tailscale, auch zu Hause. Schalte Connect ein, oder wähle Tailscale und folge [Unterwegs](/de/guides/remote/). Mit „Nicht jetzt“ funktioniert Hemmia nur im Browser auf diesem Mac.

<!-- screenshot name="mac-setup-remote" alt="Die Wahl zwischen Hemmia Connect (empfohlen), Tailscale und Nicht jetzt" -->


## Telefon hinzufügen
Installiere die Hemmia-App auf deinem Telefon, tippe auf **Code scannen** und scanne den Code auf dem Bildschirm des Macs. Dein Telefon wird dabei mit deinem Konto angemeldet. Weitere Telefone: [Telefon verbinden](/de/guides/phone-to-hub/).

<!-- screenshot name="mac-setup-phone" alt="Der letzte Schritt der Einrichtung: ein QR-Code, der das Telefon anmeldet" -->

<!-- /steps -->

<!-- note -->
Lokale Modelle laufen mit [Ollama](https://ollama.com). Hat dieser Mac es noch nicht, bietet der Modell-Schritt **Ollama installieren** an: Hemmia lädt es herunter, prüft es und startet es für dich. Nutzt du schon die Ollama-App, nimmt Hemmia diese. Cloud-Modelle funktionieren auch ohne Ollama.
<!-- /note -->

## Wo deine Daten liegen

Deine Chats und Einstellungen liegen in der Library deines Benutzers: `~/Library/Application Support/Hemmia`. Nimm diesen Ordner in deine Datensicherung auf (Time Machine sichert ihn mit); siehe [Sicherung und Wiederherstellung](/de/guides/backup/).

## Deinstallieren

Führe im Terminal aus:

```
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Das entfernt das Programm, behält deinen Datenordner und sagt dir, wo er liegt. Aktualisieren: [Aktualisieren und deinstallieren](/de/guides/updates/).
