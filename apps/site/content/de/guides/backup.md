---
title: Sicherung und Wiederherstellung
description: Den Wiederherstellungscode sicher aufbewahren, den Datenordner des Hubs sichern, auf einen neuen Computer umziehen und die Chats auf dem Telefon sichern.
nav: guides
order: 80
draft: true
---

# Sicherung und Wiederherstellung

## Dein Wiederherstellungscode

Wenn du dein Konto anlegst, zeigt Hemmia einmal einen Wiederherstellungscode. Vergisst du deine Passphrase, ist dieser Code der einzige Weg zurück in dein Konto. Niemand sonst kann sie für dich zurücksetzen, auch kein Admin.

<!-- screenshot name="mac-setup-recovery" alt="Die Anzeige des Wiederherstellungscodes, mit Kopieren-Knopf und einem Kästchen zur Bestätigung, dass er aufgeschrieben ist" -->

Schreib ihn auf Papier und bewahre ihn sicher auf, zum Beispiel bei deinen anderen wichtigen Unterlagen. Bewahre ihn nicht nur auf dem Telefon oder Computer auf, mit dem du Hemmia nutzt.

Setzt du mit dem Code eine neue Passphrase, bekommst du einen neuen Code, und der alte gilt nicht mehr.

## Den Hub sichern

Alles, was dein Hub speichert, liegt in einem Datenordner: Konten, Chats, Fotos und Dokumente. Sicherst du diesen Ordner, kannst du den Hub wiederherstellen.

- **Auf einem Mac:** Der Ordner ist `Library/Application Support/Hemmia` im Benutzerordner der Person, die Hemmia installiert hat. Time Machine sichert ihn automatisch, auch während Hemmia läuft.
- **Mit Docker:** Die Daten liegen im Volume `hemmia-data`. Stopp den Hub und kopiere das Volume in ein Archiv:

  ```sh
  docker compose stop hub
  docker run --rm -v hemmia_hemmia-data:/data -v "$PWD":/backup busybox tar czf /backup/hemmia-data.tar.gz -C /data .
  docker compose start hub
  ```

<!-- note -->
Die Chats in der Sicherung sind mit der Passphrase der jeweiligen Person verschlüsselt. Wer die Sicherung findet, kann sie nicht lesen. Du aber auch nicht, wenn du sowohl Passphrase als auch Wiederherstellungscode verlierst.
<!-- /note -->

## Umzug auf einen neuen Computer

<!-- steps -->
## Hemmia auf dem alten Computer stoppen
Führe dort das Deinstallationsprogramm aus (siehe [Aktualisieren und deinstallieren](/de/guides/updates/)). Es entfernt das Programm; dein Datenordner bleibt.

## Datenordner kopieren
Kopiere den ganzen Datenordner an dieselbe Stelle auf dem neuen Computer, in den Benutzerordner der Person, unter der Hemmia dort laufen soll.

## Hemmia auf dem neuen Computer installieren
Führe den Installer aus. Er findet die Daten, startet den Hub und überspringt die Einrichtung.
<!-- /steps -->

Konten, Chats und Passphrasen kommen mit. Mit Fernzugriff (Hemmia Connect) behält der Hub seine Adresse, die Telefone funktionieren also weiter. Mit Tailscale hat der neue Computer eine eigene Tailscale-Adresse: Gib ihm in Tailscale den alten Namen oder verbinde die Telefone neu. Lokale Modelle sind nicht im Datenordner; lade sie unter **Einstellungen → Modelle** neu herunter.

## Chats auf dem Telefon

Im Telefonmodus liegen deine Chats nur auf deinem Telefon. Sichere sie ab und zu mit **Einstellungen → Chats exportieren** in einer Datei und hol sie mit **Chats importieren** zurück, zum Beispiel auf einem neuen Telefon. Siehe [Hemmia auf dem Telefon](/de/guides/phone/).

Die Exportdatei ist nicht geschützt, bewahre sie also sicher auf. Dein API-Schlüssel ist nicht darin.
