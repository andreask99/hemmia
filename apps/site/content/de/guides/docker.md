---
title: Mit Docker einrichten
description: Den Hemmia-Hub mit Docker unter Linux, Windows oder auf einem NAS betreiben, auf Wunsch mit lokalen Modellen und Websuche.
nav: guides
order: 30
draft: true
---

# Mit Docker einrichten

Mit Docker läuft der Hub unter Linux, unter Windows mit Docker Desktop oder auf einem NAS, das Docker unterstützt. Auf einem Mac ist das [Mac-Paket](/de/guides/mac/) einfacher.

## Was du brauchst

- Einen Computer, der eingeschaltet bleibt, mit Docker und Docker Compose (unter Windows: Docker Desktop mit WSL).
- Für lokale Modelle: 8 GB Arbeitsspeicher oder mehr (16 GB für die besseren Modelle) und Platz für die Modelle (jeweils mehrere GB). Cloud-Modelle funktionieren auch ohne.
- `git`, um Hemmia von [GitHub](https://github.com/andreask99/hemmia) zu laden.

<!-- steps -->
## Hemmia herunterladen
```sh
git clone https://github.com/andreask99/hemmia.git
cd hemmia/packaging/docker
```

## Starten
```sh
./start.sh
```

Das startet den Hub, Ollama für lokale Modelle und die Websuche. Beim ersten Mal baut es den Hub und lädt Ollama und die Suchmaschine herunter; das dauert ein paar Minuten. Sobald der Hub bereit ist, öffnet es die Einrichtung in deinem Browser oder zeigt ihre Adresse.

## Die Einrichtung abschließen
Gib deiner Familie einen Namen, leg dein Konto an, schreib den Wiederherstellungscode auf, wähle deine KI (der Hub empfiehlt ein Modell, das zu diesem Computer passt) und schalte den Fernzugriff ein. Verbinde dann dein Telefon: siehe [Telefon verbinden](/de/guides/phone-to-hub/).
<!-- /steps -->

Ohne lokale Modelle: `./start.sh --no-ollama`. Ohne Websuche: `./start.sh --no-search`. Ist Port 8787 auf diesem Computer schon belegt, schreib `HEMMIA_PORT=8790` (oder einen anderen freien Port) in die Datei `.env` in diesem Ordner.

## Ein Computer ohne Browser

Auf einem NAS oder Server kannst du `localhost` nicht im Browser öffnen. Schreib `HEMMIA_CONNECT=1` in die Datei `.env` in `packaging/docker` und führ `./start.sh` aus. Er schaltet dann sofort Hemmia Connect ein, und das Log zeigt zusätzlich einen Link `https://…/setup#…`, der von jedem Gerät aus funktioniert. Behandle diesen Link wie ein Passwort, bis die Einrichtung fertig ist.

## Ollama ist schon installiert

Läuft Ollama schon auf dem Computer, starte mit `./start.sh --no-ollama` und schreib `OLLAMA_URL=http://host.docker.internal:11434` in `.env`. Unter Linux hört Ollama standardmäßig nur auf dem Computer selbst, der Container erreicht es dann nicht: Setz für den Ollama-Dienst `OLLAMA_HOST=0.0.0.0` und sorg dafür, dass deine Firewall Port 11434 zum Netzwerk hin geschlossen hält, oder nimm einfach Hemmias eigenes Ollama (einfach `./start.sh`).

## Aktualisieren und sichern

Siehe [Aktualisieren und deinstallieren](/de/guides/updates/) und [Sicherung und Wiederherstellung](/de/guides/backup/). Alle Daten des Hubs liegen im Docker-Volume `hemmia-data`.
