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

- Einen Computer, der eingeschaltet bleibt, mit Docker und Docker Compose.
- Für lokale Modelle: 16 GB Arbeitsspeicher oder mehr und Platz für die Modelle (jeweils mehrere GB). Cloud-Modelle funktionieren auch ohne.
- Die Hemmia-Dateien von GitHub. <!-- CHECK: Link zum Repository und veröffentlichtes Image (P8.5) -->

<!-- steps -->
## Den Hub starten
Gib im Ordner `packaging/docker` ein:

```sh
docker compose --profile ollama up -d
```

Das startet den Hub und Ollama für lokale Modelle. Ohne `--profile ollama` läuft der Hub allein und nutzt Cloud-Modelle.

## Die Einrichtung öffnen
Den Einrichtungslink zeigst du so an:

```sh
docker compose logs hub | grep "Hemmia setup"
```

Öffne den Link `http://localhost:8787/setup#…` in einem Browser auf demselben Computer. Er ist 24 Stunden gültig; `docker compose restart hub` zeigt einen neuen.

## Die Einrichtung abschließen
Gib deiner Familie einen Namen, leg dein Konto an, schreib den Wiederherstellungscode auf, wähle deine KI und schalte den Fernzugriff ein. Verbinde dann dein Telefon: siehe [Telefon verbinden](/de/guides/phone-to-hub/).
<!-- /steps -->

## Ein Computer ohne Browser

Auf einem NAS oder Server kannst du `localhost` nicht im Browser öffnen. Schreib `HEMMIA_CONNECT=1` in eine Datei `.env` neben `compose.yaml` und starte den Hub. Er schaltet dann sofort Hemmia Connect ein, und das Log zeigt zusätzlich einen Link `https://…/setup#…`, der von jedem Gerät aus funktioniert. Behandle diesen Link wie ein Passwort, bis die Einrichtung fertig ist.

## Websuche

```sh
echo "SEARXNG_SECRET=$(openssl rand -hex 32)" >> .env
docker compose --profile ollama --profile searxng up -d
```

## Ollama ist schon installiert

Läuft Ollama schon auf dem Computer, lass `--profile ollama` weg und schreib `OLLAMA_URL=http://host.docker.internal:11434` in `.env`. Unter Linux hört Ollama standardmäßig nur auf dem Computer selbst, der Container erreicht es dann nicht: Setz für den Ollama-Dienst `OLLAMA_HOST=0.0.0.0` und sorg dafür, dass deine Firewall Port 11434 zum Netzwerk hin geschlossen hält, oder nimm einfach `--profile ollama`.

## Aktualisieren und sichern

Siehe [Aktualisieren und deinstallieren](/de/guides/updates/) und [Sicherung und Wiederherstellung](/de/guides/backup/). Alle Daten des Hubs liegen im Docker-Volume `hemmia-data`.
