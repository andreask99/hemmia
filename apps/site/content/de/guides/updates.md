---
title: Aktualisieren und deinstallieren
description: Wie du von einer neuen Version erfährst, wie du sie installierst und wie du Hemmia entfernst, ohne deine Daten zu verlieren.
nav: guides
order: 85
draft: true
---

# Aktualisieren und deinstallieren

## Von einer neuen Version erfahren

Admins sehen unter **Einstellungen → System** einen Hinweis, wenn eine neue Version verfügbar ist, mit einem Link zu **Neuerungen und Aktualisierung**.

## Auf dem Mac aktualisieren

Lade das neue Paket auf der [Download-Seite](/de/download/) herunter und installiere es wie beim ersten Mal. Der Installer behält deine Daten, ersetzt das Programm und startet den Hub neu; die Einrichtung läuft nicht noch einmal. Telefone bleiben verbunden. Antworten, die gerade geschrieben werden, brechen ab. Aktualisiere also, wenn niemand chattet.

## Mit Docker aktualisieren

Hol im Ordner `packaging/docker` die neue Version und starte den Hub neu:

```sh
git pull
docker compose --profile ollama build hub
docker compose --profile ollama up -d
```

Deine Daten bleiben im Volume `hemmia-data`. <!-- CHECK: auf `docker compose pull` umstellen, sobald Images veröffentlicht sind (P8.5) -->

## Auf dem Mac deinstallieren

Öffne das Terminal und gib ein:

```sh
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Das entfernt das Programm und stoppt den Hub. Deine Chats und Einstellungen bleiben in `Library/Application Support/Hemmia` in deinem Benutzerordner. Lösche diesen Ordner selbst, wenn sie auch weg sollen.
