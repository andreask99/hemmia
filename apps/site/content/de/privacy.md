---
title: Datenschutz und Sicherheit, einfach erklärt
description: Was auf deinen Geräten bleibt, was an einen KI-Anbieter geht, was unser Relay sieht und was diese Website aufbewahrt.
nav: privacy
order: 20
---

# Datenschutz und Sicherheit, einfach erklärt

Auf dieser Seite steht in einfachen Worten, was mit deinen Daten passiert. Die technischen Einzelheiten stehen im [Sicherheitskonzept](https://github.com/andreask99/hemmia/blob/main/docs/SECURITY.md), das mit dem Quellcode veröffentlicht ist. Verbindlich ist unsere [Datenschutzerklärung](/de/legal/privacy/).

## Was auf deinen Geräten bleibt

- **Zu Hause:** Deine Chats, Fotos und Dokumente liegen auf deinem Hub. Die Inhalte jeder Person sind mit einem Schlüssel verschlüsselt, der aus ihrer eigenen Passphrase entsteht. Andere in der Familie können sie nicht lesen, auch nicht das Admin-Konto des Hubs. Wenn du deine Passphrase vergisst, kommst du mit deinem Wiederherstellungscode wieder hinein.
- **Auf dem Telefon:** Deine Chats und Fotos liegen in der App, verschlüsselt mit einem Schlüssel, den nur der sichere Speicher des Telefons kennt.
- Es gibt kein Hemmia-Konto und keinen Server von uns, der deine Chats aufbewahrt.

**Eine Grenze:** Während du Hemmia nutzt, muss der Hub deine Nachrichten entschlüsseln, um sie zu beantworten. Wer in diesem Moment den Computer des Hubs vollständig kontrolliert (nicht nur das Admin-Konto), könnte sie theoretisch lesen. Die Verschlüsselung schützt, was gespeichert ist, und schützt jede Person vor den anderen.

## Was an einen KI-Anbieter geht, und wann

- **Lokale Modelle** laufen auf deinem Hub. Was du ihnen schreibst, verlässt dein Zuhause nie.
- **Cloud-Modelle** (Anthropic, OpenAI und andere) bekommen die Nachrichten der Chats, die du mit ihnen führst, denn sie schreiben die Antworten. Das passiert nur mit einem Schlüssel, den du selbst eingetragen hast, und nur bei Chats, in denen du eines dieser Modelle gewählt hast. Auf einem Hub ist dein Schlüssel mit deiner Passphrase verschlüsselt; niemand sonst, auch nicht die Admin-Person, kann ihn sehen oder nutzen. Für das, was der Anbieter erhält, gelten seine eigenen Datenschutzbedingungen.
- Auf dem Telefon spricht die App direkt mit dem Anbieter. Dein Schlüssel liegt im sicheren Speicher des Telefons und wird nur an diesen Anbieter geschickt.

## Was unser Relay sieht (Hemmia Connect)

Wenn du Hemmia Connect einschaltest, erreichen Telefone deinen Hub unterwegs über unser Relay.

- Die Verbindung ist vom Telefon bis zum Hub verschlüsselt. Das Relay leitet sie weiter, hat aber keinen Schlüssel dafür. Es sieht nie deine Nachrichten, Passphrasen, Fotos oder welchen Chat du gerade öffnest.
- Es weiss: die Adresse deines Hubs, wann er zuletzt verbunden war, wie viele Daten diesen Monat durchgingen und, solange eine Verbindung offen ist, die IP-Adresse des Telefons, die es auch an deinen Hub weitergibt, damit dieser das Erraten von Passwörtern bremsen kann. In den Protokollen stehen IP-Adressen nur gekürzt.
- **Das eine, was es theoretisch könnte:** Wer das Relay betreibt, verwaltet die Adressen unter seiner Domain. Er könnte daher theoretisch ein Zertifikat für die Adresse deines Hubs bekommen und Verbindungen abfangen, solange er das tut. Das ist dasselbe Vertrauen, das du jeder Website und ihrer Verschlüsselung entgegenbringst. Jedes solche Zertifikat wird in öffentlichen Protokollen veröffentlicht und ist dort sichtbar. Wenn du dieses Vertrauen nicht geben möchtest, nutze stattdessen **Tailscale** oder nutze den Hub nur im Browser auf seinem eigenen Computer.

## Mitteilungen

Wenn eine Antwort oder ein Bild fertig ist, bekommt dein Telefon eine Mitteilung. Sie enthält keinen Inhalt: Der Text, den du siehst („Deine Antwort ist da“), kommt aus der App selbst, und der Verweis auf den Chat ist von deinem Hub verschlüsselt. Weder Apple noch unser Relay können erkennen, zu welchem Chat sie gehört.

## Update-Prüfung

Einmal am Tag fragt ein Hub, der aus unserem Paket oder Docker-Image installiert wurde, unseren Server, ob es eine neuere Version gibt. Die Anfrage sagt nur, welche Version er hat, ob es die Mac- oder die Docker-Version ist und ob er normale oder Test-Versionen bekommt. Wir zählen diese Anfragen pro Tag und wissen so ungefähr, wie viele Hubs welche Version haben. Deine IP-Adresse speichern wir nicht, und über dich oder deine Familie wird nichts geschickt. Die Antwort ist signiert, damit dein Hub ihr nur vertraut, wenn sie wirklich von uns kommt. Mit Docker schaltest du die Prüfung aus, indem du `HEMMIA_UPDATE_CHECK=0` in `.env` setzt. Auf dem Mac ist ein Schalter in den Einstellungen geplant; bis dahin schreib uns, dann sagen wir dir, wie.

## Diese Website

Keine Cookies, keine Statistik, keine Zählpixel, keine Schriften oder Skripte von anderen Seiten. Der Server, der die Dateien ausliefert, führt eventuell übliche Zugriffsprotokolle; wir nutzen sie nicht, um jemanden zu verfolgen.

## Open Source

Der Code von Hemmia ist [auf GitHub veröffentlicht](https://github.com/andreask99/hemmia), unter der AGPL-Lizenz, damit alle nachprüfen können, was er tut. Wenn du ein Sicherheitsproblem findest, melde es bitte vertraulich, über [GitHubs vertrauliche Meldung](https://github.com/andreask99/hemmia/security/advisories/new) oder an andreas.apps@icloud.com. Wir beheben es so schnell wie möglich.

Verbindlich sind unsere [Datenschutzerklärung](/de/legal/privacy/) und unsere [Nutzungsbedingungen](/de/legal/terms/).
